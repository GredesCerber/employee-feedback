import type { Complaint } from './model.js';
import type { Persistence } from './persistence.js';
import { seedComplaints, seedReferenceData, seedUsers } from './seed.js';

/** Isolated demo memory store. Restart deliberately reloads the immutable seed. */
export class ComplaintStore {
  private readonly records = new Map<string, Complaint>();
  private writes: Promise<void> = Promise.resolve();
  /** Last persistence error, kept so a failed write does not stop later ones. */
  writeError: unknown = null;

  /** Without persistence the store is purely in memory (tests, docker compose). */
  constructor(private readonly persistence?: Persistence) {}

  /** Load previously stored complaints before seeding. */
  async hydrate(): Promise<void> {
    if (!this.persistence) return;
    for (const item of await this.persistence.load()) this.records.set(item.id, structuredClone(item));
  }

  /** Resolves when every queued write has reached the database. */
  flush(): Promise<void> { return this.writes; }

  private persist(item: Complaint): void {
    const persistence = this.persistence;
    if (!persistence) return;
    const snapshot = structuredClone(item);
    this.writes = this.writes
      .then(() => persistence.save(snapshot))
      .then(() => { this.writeError = null; }, error => { this.writeError = error; });
  }

  get referenceData() { return structuredClone(seedReferenceData); }
  get users() { return structuredClone(seedUsers); }

  seed() {
    for (const complaint of seedComplaints()) {
      if (!this.records.has(complaint.id)) {
        this.records.set(complaint.id, structuredClone(complaint));
        this.persist(complaint);
      }
    }
  }

  list(): Complaint[] { return structuredClone([...this.records.values()]); }
  nextNumber(): number {
    return Math.max(0, ...this.list().map(item => Number(item.number.slice(2)))) + 1;
  }
  save(item: Complaint): void {
    this.records.set(item.id, structuredClone(item));
    this.persist(item);
  }
  get(id: string): Complaint | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}
