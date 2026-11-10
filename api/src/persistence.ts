import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { validateBody } from './http.js';
import type { Complaint } from './model.js';

/** Optional single-writer JSON snapshot; no database or migration contract. */
export class FilePersistence {
  readonly path: string;
  constructor(path: string) {
    if (!path.trim()) throw new Error('PERSIST_FILE must not be blank');
    this.path = resolve(path);
  }

  load(): Complaint[] | undefined {
    let text: string;
    try { text = fs.readFileSync(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      const data: unknown = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Expected an array');
      const records = data.map(item => validateBody<Complaint>('Complaint', item));
      if (new Set(records.map(item => item.id)).size !== records.length
        || new Set(records.map(item => item.number)).size !== records.length
        || records.some(item => !Number.isSafeInteger(Number(item.number.slice(2))))) {
        throw new Error('Invalid identifiers');
      }
      return records;
    } catch {
      process.emitWarning('Persisted snapshot is empty or invalid; recovering synthetic seed.', { code: 'PERSIST_FILE_INVALID' });
      return undefined;
    }
  }

  save(records: Complaint[]): void {
    fs.mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      // The temporary file is a sibling so rename stays on the same filesystem.
      fs.writeFileSync(temporary, JSON.stringify(records), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, this.path);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}
