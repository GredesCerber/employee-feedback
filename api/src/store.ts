import type { Category, Complaint, ReferenceData, User } from './model.js';
import { seedComplaints, seedReferenceData, seedUsers } from './seed.js';
import { FilePersistence } from './persistence.js';
import type { AuditEntry, DatabasePersistence, DirectorySnapshot } from './pg-persistence.js';
import { randomUUID } from 'node:crypto';
import { DEFAULT_DEMO_PASSWORD, checkPassword, hashPassword } from './auth-token.js';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

/** Isolated demo memory store. Restart deliberately reloads the immutable seed. */
export class ComplaintStore {
  private readonly records = new Map<string, Complaint>();
  private readonly persistence?: FilePersistence;

  private readonly database?: DatabasePersistence;
  /** Complaints not yet confirmed by the database; the newest snapshot per id wins. */
  private readonly dirty = new Map<string, Complaint>();
  private draining: Promise<void> | null = null;
  private resetting = false;
  private retryTimer: NodeJS.Timeout | null = null;
  /** Last database write error, null after a fully successful drain. */
  writeError: unknown = null;
  retryDelayMs = 5_000;

  /** `database` (DATABASE_URL) takes precedence over the single-file snapshot (PERSIST_FILE). */
  constructor(persistFile?: string, database?: DatabasePersistence) {
    this.database = database;
    if (persistFile !== undefined && !database) {
      this.persistence = new FilePersistence(persistFile);
      for (const item of this.persistence.load() ?? []) this.records.set(item.id, structuredClone(item));
      this.directoryFile = `${persistFile}.directory.json`;
      try {
        if (existsSync(this.directoryFile)) this.applyDirectory(JSON.parse(readFileSync(this.directoryFile, 'utf8')) as DirectorySnapshot);
      } catch { /* a broken directory file falls back to the seed directory */ }
    }
  }

  private directoryFile?: string;
  private auditLog: AuditEntry[] = [];
  /** Password hashes by user id; seeded users without one accept the published demo password. */
  private credentials = new Map<string, string>();

  setPassword(userId: string, password: string): void { this.credentials.set(userId, hashPassword(password)); this.persistDirectory(); }
  verifyPassword(userId: string, password: string): boolean {
    const stored = this.credentials.get(userId);
    if (stored) return checkPassword(password, stored);
    return seedUsers.some(user => user.id === userId) && password === DEFAULT_DEMO_PASSWORD;
  }
  /** Append to the action journal (memory and database; file mode keeps it in memory); never throws into a request. */
  audit(entry: Omit<AuditEntry, 'id' | 'at'>): void {
    const full: AuditEntry = { id: randomUUID(), at: new Date().toISOString(), ...entry };
    this.auditLog.push(full);
    if (this.auditLog.length > 500) this.auditLog.shift();
    void this.database?.appendAudit?.(full).catch(() => undefined);
  }
  recentAudit(limit: number): AuditEntry[] { return structuredClone(this.auditLog.slice(-limit).reverse()); }

  private directoryDirty: { snapshot: DirectorySnapshot | null } | null = null;

  private applyDirectory(snapshot: DirectorySnapshot): void {
    if (!Array.isArray(snapshot.users) || !Array.isArray(snapshot.categories) || !Array.isArray(snapshot.inactive)) return;
    this.userList = structuredClone(snapshot.users);
    this.inactive.clear();
    for (const id of snapshot.inactive) this.inactive.add(id);
    this.credentials = new Map(Object.entries(snapshot.credentials ?? {}));
    this.categoryList = structuredClone(snapshot.categories);
  }

  /** Persist the directory after an administrator change; `null` (reset) removes stored changes. */
  private persistDirectory(reset = false): void {
    const snapshot: DirectorySnapshot | null = reset ? null : {
      users: structuredClone(this.userList), inactive: [...this.inactive], categories: structuredClone(this.categoryList),
      credentials: Object.fromEntries(this.credentials) };
    if (this.directoryFile) {
      try {
        if (snapshot === null) rmSync(this.directoryFile, { force: true });
        else { writeFileSync(`${this.directoryFile}.tmp`, JSON.stringify(snapshot)); renameSync(`${this.directoryFile}.tmp`, this.directoryFile); }
      } catch (error) { this.writeError = error; }
    }
    if (this.database?.saveDirectory) { this.directoryDirty = { snapshot }; void this.flush(); }
  }

  /** Load stored complaints from the database; call before seed(). */
  async hydrate(): Promise<void> {
    if (!this.database) return;
    for (const item of await this.database.load()) this.records.set(item.id, structuredClone(item));
    const directory = await this.database.loadDirectory?.();
    if (directory) this.applyDirectory(directory);
    this.auditLog = (await this.database.loadAudit?.(500)) ?? [];
  }

  /** Writes every pending complaint; failures stay pending and are retried (next write, flush or timer). */
  flush(): Promise<void> {
    if (!this.database) return Promise.resolve();
    if (this.resetting) return this.draining ?? Promise.resolve();
    this.draining ??= this.drain().finally(() => { this.draining = null; });
    return this.draining;
  }

  private async drain(): Promise<void> {
    const database = this.database!;
    while (this.directoryDirty && database.saveDirectory) {
      const pending = this.directoryDirty;
      try {
        await database.saveDirectory(pending.snapshot);
        if (this.directoryDirty === pending) this.directoryDirty = null;
        this.writeError = null;
      } catch (error) {
        this.writeError = error;
        this.scheduleRetry();
        return;
      }
    }
    for (const [id, item] of [...this.dirty]) {
      if (this.resetting) return;
      try {
        await database.save(item);
        if (this.dirty.get(id) === item) this.dirty.delete(id);
        this.writeError = null;
      } catch (error) {
        this.writeError = error;
        this.scheduleRetry();
        return;
      }
    }
    // Writes queued while draining.
    if (!this.resetting && this.dirty.size > 0 && !this.writeError) await this.drain();
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.flush(); }, this.retryDelayMs);
    this.retryTimer.unref();
  }

  private enqueue(item: Complaint): void {
    if (!this.database) return;
    this.dirty.set(item.id, structuredClone(item));
    void this.flush();
  }

  /** Demo directory: administrators add users, change roles and routing in memory; a demo reset restores the seed. */
  private userList: User[] = structuredClone(seedUsers);
  private readonly inactive = new Set<string>();
  private categoryList: Category[] = structuredClone(seedReferenceData.categories);

  /** Active users only: a deactivated user can no longer act (identity() answers 401). */
  get users(): User[] { return structuredClone(this.userList.filter(user => !this.inactive.has(user.id))); }
  get referenceData(): ReferenceData {
    const active = this.users;
    return { departments: structuredClone(seedReferenceData.departments), categories: structuredClone(this.categoryList),
      assignees: active.filter(user => user.role === 'manager') };
  }
  /** Every user including deactivated ones, for the admin section. */
  get allUsers(): (User & { active: boolean })[] {
    return structuredClone(this.userList).map(user => ({ ...user, active: !this.inactive.has(user.id) }));
  }
  addUser(input: { name: string; role: User['role']; departmentId: string }): User & { active: boolean } {
    let n = this.userList.length + 1;
    while (this.userList.some(user => user.id === `${input.role}-${n}`)) n += 1;
    const user: User = { id: `${input.role}-${n}`, name: input.name, role: input.role, departmentId: input.departmentId };
    this.userList.push(user);
    this.persistDirectory();
    return { ...structuredClone(user), active: true };
  }
  updateUser(id: string, patch: { name?: string; role?: User['role']; departmentId?: string; active?: boolean }): (User & { active: boolean }) | undefined {
    const user = this.userList.find(candidate => candidate.id === id);
    if (!user) return undefined;
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.departmentId !== undefined) user.departmentId = patch.departmentId;
    if (patch.active === false) this.inactive.add(id); else if (patch.active === true) this.inactive.delete(id);
    // A user who is no longer an active manager cannot stay responsible for a category: back to the fallback queue.
    if (user.role !== 'manager' || this.inactive.has(id)) {
      for (const category of this.categoryList) if (category.assigneeId === id) category.assigneeId = null;
    }
    this.persistDirectory();
    return { ...structuredClone(user), active: !this.inactive.has(id) };
  }
  updateCategory(id: string, patch: { assigneeId?: string | null; dueInDays?: number; name?: string }): Category | undefined {
    const category = this.categoryList.find(candidate => candidate.id === id);
    if (!category) return undefined;
    Object.assign(category, patch);
    this.persistDirectory();
    return structuredClone(category);
  }
  private resetDirectory(): void {
    this.userList = structuredClone(seedUsers);
    this.inactive.clear();
    this.credentials.clear();
    this.categoryList = structuredClone(seedReferenceData.categories);
  }

  seed() {
    const snapshot = new Map(this.records);
    for (const complaint of seedComplaints()) {
      if (!snapshot.has(complaint.id)) snapshot.set(complaint.id, structuredClone(complaint));
    }
    this.persistence?.saveSeed([...snapshot.values()]);
    for (const [id, item] of snapshot) {
      if (!this.records.has(id)) this.enqueue(item);
      this.records.set(id, item);
    }
  }

  list(): Complaint[] { return structuredClone([...this.records.values()]); }
  nextNumber(): number {
    return Math.max(0, ...this.list().map(item => Number(item.number.slice(2)))) + 1;
  }
  save(item: Complaint): void {
    if (this.resetting) throw new Error('Demo reset is in progress. Retry the write after reset.');
    const copy = structuredClone(item);
    const snapshot = new Map(this.records);
    snapshot.set(copy.id, copy);
    // Publish memory only after successful disk replacement. Failed writes are atomic too.
    this.persistence?.save([...snapshot.values()]);
    this.records.set(copy.id, copy);
    this.enqueue(copy);
  }
  /**
   * Replace everything with the immutable seed. Durable storage is rewritten first,
   * memory is published only afterwards, so a failure leaves the store untouched.
   */
  async reset(): Promise<number> {
    if (this.resetting) throw new Error('Demo reset is already in progress.');
    this.resetting = true;
    try {
      // Finish the current write before replacing the database, and prevent any
      // queued snapshot or retry from restoring pre-reset data afterwards.
      await this.draining;
      const seed = seedComplaints();
      this.persistence?.save(seed);
      await this.database?.replaceAll(seed);
      this.dirty.clear();
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.writeError = null;
      this.resetDirectory();
      this.persistDirectory(true);
      this.records.clear();
      for (const item of seed) this.records.set(item.id, structuredClone(item));
      return seed.length;
    } finally {
      this.resetting = false;
      // A failed replacement keeps the existing memory and pending writes.
      if (this.dirty.size > 0 || this.directoryDirty) void this.flush();
    }
  }
  get(id: string): Complaint | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}
