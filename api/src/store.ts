import type { Complaint } from './model.js';
import { seedComplaints, seedReferenceData, seedUsers } from './seed.js';
import { FilePersistence } from './persistence.js';
import type { DatabasePersistence } from './pg-persistence.js';

/** Isolated demo memory store. Restart deliberately reloads the immutable seed. */
export class ComplaintStore {
  private readonly records = new Map<string, Complaint>();
  private readonly persistence?: FilePersistence;

  private readonly database?: DatabasePersistence;
  private writes: Promise<void> = Promise.resolve();
  /** Last database write error; a failed write does not stop later ones. */
  writeError: unknown = null;

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

  /** Resolves when every queued database write has finished. */
  flush(): Promise<void> { return this.writes; }

  private enqueue(item: Complaint): void {
    const database = this.database;
    if (!database) return;
    const snapshot = structuredClone(item);
    this.writes = this.writes
      .then(() => database.save(snapshot))
      .then(() => { this.writeError = null; }, error => { this.writeError = error; });
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
  get(id: string): Complaint | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}
