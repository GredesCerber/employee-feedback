import type { Complaint } from './model.js';
import { seedComplaints, seedReferenceData, seedUsers } from './seed.js';
import { FilePersistence } from './persistence.js';

/** Isolated demo memory store. Restart deliberately reloads the immutable seed. */
export class ComplaintStore {
  private readonly records = new Map<string, Complaint>();
  private readonly persistence?: FilePersistence;

  constructor(persistFile?: string) {
    if (persistFile !== undefined) {
      this.persistence = new FilePersistence(persistFile);
      for (const item of this.persistence.load() ?? []) this.records.set(item.id, structuredClone(item));
    }
  }

  get referenceData() { return structuredClone(seedReferenceData); }
  get users() { return structuredClone(seedUsers); }

  seed() {
    const snapshot = new Map(this.records);
    for (const complaint of seedComplaints()) {
      if (!snapshot.has(complaint.id)) snapshot.set(complaint.id, structuredClone(complaint));
    }
    this.persistence?.save([...snapshot.values()]);
    for (const [id, item] of snapshot) this.records.set(id, item);
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
  }
  get(id: string): Complaint | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}
