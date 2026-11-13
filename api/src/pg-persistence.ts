import pg from 'pg';
import type { Category, Complaint, User } from './model.js';

/** Users, deactivation flags and routing rules edited by an administrator; survives restarts. */
export interface DirectorySnapshot { users: User[]; inactive: string[]; categories: Category[]; credentials?: Record<string, string> }

/** One journal row: who did what and when. */
export interface AuditEntry { id: string; at: string; actorId: string | null; actorName: string | null; action: string; target: string | null; detail: string | null }

/** Database storage behind the in-memory cache (the cache stays the source for reads). */
export interface DatabasePersistence {
  load(): Promise<Complaint[]>;
  save(item: Complaint): Promise<void>;
  /** Atomically replace all stored complaints (demo reset). */
  replaceAll(items: Complaint[]): Promise<void>;
  /** Optional: directory (users and category rules) storage. */
  loadDirectory?(): Promise<DirectorySnapshot | null>;
  saveDirectory?(snapshot: DirectorySnapshot | null): Promise<void>;
  /** Optional: append-only action journal. */
  appendAudit?(entry: AuditEntry): Promise<void>;
  loadAudit?(limit: number): Promise<AuditEntry[]>;
  close(): Promise<void>;
}

/** Postgres (Neon, Render, local): one JSONB row per complaint. */
export async function createPgPersistence(connectionString: string): Promise<DatabasePersistence> {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    // Neon and most hosted Postgres require TLS; local docker Postgres does not.
    // rejectUnauthorized:false is a deliberate demo trade-off: traffic is still
    // encrypted, but the server certificate is not checked against a CA, so the
    // hosted demo works with any provider without shipping a CA bundle. This leaves
    // room for a man-in-the-middle; for production pin the provider's CA
    // (ssl: { ca }) or use sslmode=verify-full. See infra/ENV.md (DATABASE_URL).
    // Covered by api/test/pg-persistence.test.mjs.
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS complaints (
    id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
    key text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    seq bigserial PRIMARY KEY, id text NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL)`);
  return {
    async appendAudit(entry) {
      await pool.query('INSERT INTO audit_log (id, at, data) VALUES ($1, $2, $3::jsonb)', [entry.id, entry.at, JSON.stringify(entry)]);
    },
    async loadAudit(limit) {
      const { rows } = await pool.query<{ data: AuditEntry }>('SELECT data FROM audit_log ORDER BY seq DESC LIMIT $1', [limit]);
      return rows.map(row => row.data).reverse();
    },
    async loadDirectory() {
      const { rows } = await pool.query<{ data: DirectorySnapshot }>(`SELECT data FROM app_state WHERE key = 'directory'`);
      return rows[0]?.data ?? null;
    },
    async saveDirectory(snapshot) {
      if (snapshot === null) { await pool.query(`DELETE FROM app_state WHERE key = 'directory'`); return; }
      await pool.query(
        `INSERT INTO app_state (key, data) VALUES ('directory', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [JSON.stringify(snapshot)],
      );
    },
    async load() {
      const { rows } = await pool.query<{ data: Complaint }>('SELECT data FROM complaints');
      return rows.map(row => row.data);
    },
    async save(item) {
      await pool.query(
        `INSERT INTO complaints (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [item.id, JSON.stringify(item)],
      );
    },
    async replaceAll(items) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM complaints');
        for (const item of items) {
          await client.query('INSERT INTO complaints (id, data) VALUES ($1, $2::jsonb)', [item.id, JSON.stringify(item)]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
