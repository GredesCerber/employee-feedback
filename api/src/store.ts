import type { Complaint } from './model.js';
import { seedComplaints, seedReferenceData, seedUsers } from './seed.js';

/** Isolated demo memory store. Restart deliberately reloads the immutable seed. */
export class ComplaintStore {
  private readonly records = new Map<string, Complaint>();

  get referenceData() { return structuredClone(seedReferenceData); }
  get users() { return structuredClone(seedUsers); }

  seed() {
    for (const complaint of seedComplaints()) {
      if (!this.records.has(complaint.id)) this.records.set(complaint.id, structuredClone(complaint));
    }
  }

  list(): Complaint[] { return structuredClone([...this.records.values()]); }
  nextNumber(): number {
    return Math.max(0, ...this.list().map(item => Number(item.number.slice(2)))) + 1;
  }
  save(item: Complaint): void { this.records.set(item.id, structuredClone(item)); }
  get(id: string): Complaint | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}
