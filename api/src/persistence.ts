import pg from 'pg';
import type { Complaint } from './model.js';

/** Durable storage behind the in-memory cache. The cache stays the source for reads. */
export interface Persistence {
  load(): Promise<Complaint[]>;
  save(item: Complaint): Promise<void>;
  close(): Promise<void>;
}

/** Postgres (Neon, Render, local): one JSONB row per complaint. */
export async function createPgPersistence(connectionString: string): Promise<Persistence> {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    // Neon and most hosted Postgres require TLS; local docker Postgres does not.
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS complaints (
    id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  return {
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
    close: () => pool.end(),
  };
}
