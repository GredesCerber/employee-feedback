import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { validateBody } from './http.js';
import type { Complaint } from './model.js';

type RecoveryReason = 'json_parse' | 'schema_validation';

/** Optional single-writer JSON snapshot; no database or migration contract. */
export class FilePersistence {
  readonly path: string;
  private pendingRecovery?: RecoveryReason;
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
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { return this.recover('json_parse'); }
    try {
      if (!Array.isArray(data)) throw new Error('Expected an array');
      const records = data.map(item => validateBody<Complaint>('Complaint', item));
      if (new Set(records.map(item => item.id)).size !== records.length
        || new Set(records.map(item => item.number)).size !== records.length
        || records.some(item => !Number.isSafeInteger(Number(item.number.slice(2))))) {
        throw new Error('Invalid identifiers');
      }
      return records;
    } catch { return this.recover('schema_validation'); }
  }

  private recover(reason: RecoveryReason): undefined {
    this.pendingRecovery = reason;
    this.backupInvalidFile(reason);
    return undefined;
  }

  private backupInvalidFile(reason: RecoveryReason): boolean {
    // UUID suffix also distinguishes starts in the same millisecond or after a clock reset.
    let backupPath: string;
    do { backupPath = `${this.path}.bak-${new Date().toISOString().replace(/:/g, '-')}-${randomUUID()}`; }
    while (fs.existsSync(backupPath));
    let created = false;
    try {
      fs.renameSync(this.path, backupPath);
      this.pendingRecovery = undefined;
      created = true;
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', code: 'PERSIST_BACKUP_FAILED', path: this.path,
        backupPath, reason, errorCode: (error as NodeJS.ErrnoException).code ?? 'UNKNOWN',
        message: 'Original snapshot preserved; writes blocked until backup succeeds.' }));
    }
    // Do not include malformed JSON or validation values: they may contain private text.
    process.emitWarning(JSON.stringify({ level: 'warn', path: this.path, backupPath, reason,
      backupCreated: created, message: 'Invalid snapshot; recovering synthetic seed.' }), { code: 'PERSIST_FILE_INVALID' });
    return created;
  }

  /** Recovery may serve the seed in memory, but must never erase an unbacked original. */
  saveSeed(records: Complaint[]): void {
    if (this.pendingRecovery) return;
    this.save(records);
  }

  save(records: Complaint[]): void {
    if (this.pendingRecovery && !this.backupInvalidFile(this.pendingRecovery)) {
      throw new Error('PERSIST_FILE backup must succeed before writing');
    }
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
