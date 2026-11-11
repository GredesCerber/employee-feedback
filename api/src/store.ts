import type { Complaint } from './model.js';
import { seedComplaints, seedReferenceData, seedUsers } from './seed.js';
import { FilePersistence } from './persistence.js';
import type { DatabasePersistence } from './pg-persistence.js';

/** Isolated demo memory store. Restart deliberately reloads the immutable seed. */
export class ComplaintStore {
  private readonly records = new Map<string, Complaint>();
  private readonly persistence?: FilePersistence;

  private readonly database?: DatabasePersistence;
  /** Complaints not yet confirmed by the database; the newest snapshot per id wins. */
  private readonly dirty = new Map<string, Complaint>();
  private draining: Promise<void> | null = null;
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
    }
  }

  /** Load stored complaints from the database; call before seed(). */
  async hydrate(): Promise<void> {
    if (!this.database) return;
    for (const item of await this.database.load()) this.records.set(item.id, structuredClone(item));
  }

  /** Writes every pending complaint; failures stay pending and are retried (next write, flush or timer). */
  flush(): Promise<void> {
    if (!this.database) return Promise.resolve();
    this.draining ??= this.drain().finally(() => { this.draining = null; });
    return this.draining;
  }

  private async drain(): Promise<void> {
    const database = this.database!;
    for (const [id, item] of [...this.dirty]) {
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
    if (this.dirty.size > 0 && !this.writeError) await this.drain();
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

  get referenceData() { return structuredClone(seedReferenceData); }
  get users() { return structuredClone(seedUsers); }

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
    const seed = seedComplaints();
    this.persistence?.save(seed);
    await this.database?.replaceAll(seed);
    this.dirty.clear();
    this.records.clear();
    for (const item of seed) this.records.set(item.id, structuredClone(item));
    return seed.length;
  }
  get(id: string): Complaint | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}
