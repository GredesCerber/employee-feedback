// Г8: PostgreSQL storage without a real database. pg.Pool is replaced by an
// in-memory fake that understands exactly the statements pg-persistence.ts sends
// and stages writes inside BEGIN..COMMIT, so a failed replaceAll can be checked
// for rollback.
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { createPgPersistence } from '../dist/pg-persistence.js';

function installFakePool(t, { failInsertId } = {}) {
  const state = { configs: [], statements: [], rows: new Map(), ended: false, released: 0 };
  class FakeClient {
    constructor() { this.tx = null; }
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, ' ').trim();
      state.statements.push(text);
      const target = this.tx ?? state.rows;
      if (text.startsWith('CREATE TABLE IF NOT EXISTS complaints') || text.startsWith('CREATE TABLE IF NOT EXISTS app_state')) return { rows: [] };
      if (text === 'BEGIN') { this.tx = new Map(state.rows); return { rows: [] }; }
      if (text === 'COMMIT') { state.rows = this.tx; this.tx = null; return { rows: [] }; }
      if (text === 'ROLLBACK') { this.tx = null; return { rows: [] }; }
      if (text === 'DELETE FROM complaints') { target.clear(); return { rows: [] }; }
      if (text === 'SELECT data FROM complaints') return { rows: [...target.values()].map(data => ({ data: structuredClone(data) })) };
      if (text.startsWith('INSERT INTO complaints (id, data) VALUES ($1, $2::jsonb)')) {
        const [id, json] = params;
        assert.equal(typeof json, 'string', 'data must be sent as a JSON string for ::jsonb');
        if (id === failInsertId) throw new Error('simulated insert failure');
        const upsert = text.includes('ON CONFLICT (id) DO UPDATE');
        if (target.has(id) && !upsert) throw new Error(`duplicate key value violates unique constraint "complaints_pkey"`);
        target.set(id, JSON.parse(json));
        return { rows: [] };
      }
      throw new Error(`unexpected SQL in fake pool: ${text}`);
    }
    release() { state.released += 1; }
  }
  class FakePool extends FakeClient {
    constructor(config) { super(); state.configs.push(config); }
    async connect() { return new FakeClient(); }
    async end() { state.ended = true; }
  }
  t.mock.property(pg, 'Pool', FakePool);
  return state;
}

const complaint = (id, extra = {}) => ({ id, number: id.toUpperCase(), status: 'new', description: `text ${id}`, history: [], ...extra });

test('creates the table and round-trips complaints as JSONB', async t => {
  const state = installFakePool(t);
  const db = await createPgPersistence('postgres://u:p@db.example.com/app');
  assert.match(state.statements[0], /^CREATE TABLE IF NOT EXISTS complaints \( ?id text PRIMARY KEY, data jsonb NOT NULL/);
  assert.deepEqual(await db.load(), []);
  const item = complaint('complaint-1', { tags: ['кухня'], location: { building: 'A' } });
  await db.save(item);
  assert.deepEqual(await db.load(), [item]);
  await db.close();
  assert.equal(state.ended, true);
});

test('save upserts: the second save of the same id replaces the row', async t => {
  installFakePool(t);
  const db = await createPgPersistence('postgres://u:p@db.example.com/app');
  await db.save(complaint('complaint-1'));
  await db.save(complaint('complaint-1', { status: 'resolved' }));
  const rows = await db.load();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'resolved');
});

test('replaceAll swaps the whole set inside one transaction', async t => {
  const state = installFakePool(t);
  const db = await createPgPersistence('postgres://u:p@db.example.com/app');
  await db.save(complaint('old-1'));
  await db.replaceAll([complaint('seed-1'), complaint('seed-2')]);
  assert.deepEqual((await db.load()).map(row => row.id).sort(), ['seed-1', 'seed-2']);
  const tx = state.statements.slice(state.statements.indexOf('BEGIN'), state.statements.indexOf('COMMIT') + 1);
  assert.deepEqual(tx.map(s => s.split(' (')[0]), ['BEGIN', 'DELETE FROM complaints', 'INSERT INTO complaints', 'INSERT INTO complaints', 'COMMIT']);
  assert.equal(state.released, 1);
});

test('failed replaceAll rolls back, keeps prior rows and releases the client', async t => {
  const state = installFakePool(t, { failInsertId: 'seed-2' });
  const db = await createPgPersistence('postgres://u:p@db.example.com/app');
  await db.save(complaint('old-1'));
  await assert.rejects(db.replaceAll([complaint('seed-1'), complaint('seed-2')]), /simulated insert failure/);
  assert.deepEqual((await db.load()).map(row => row.id), ['old-1']);
  assert.ok(state.statements.includes('ROLLBACK'));
  assert.ok(!state.statements.includes('COMMIT'));
  assert.equal(state.released, 1);
});

test('TLS: hosted URLs use encryption without CA pinning, local ones skip TLS', async t => {
  const state = installFakePool(t);
  const cases = [
    ['postgres://u:p@ep-x.eu-central-1.aws.neon.tech/app?sslmode=require', { rejectUnauthorized: false }],
    ['postgres://u:p@dpg-x.oregon-postgres.render.com/app', { rejectUnauthorized: false }],
    ['postgres://u:p@localhost:5432/app', false],
    ['postgres://u:p@127.0.0.1:5432/app', false],
    ['postgres://u:p@db:5432/app?sslmode=disable', false],
  ];
  for (const [url] of cases) await createPgPersistence(url);
  assert.deepEqual(state.configs.map(c => c.ssl), cases.map(([, ssl]) => ssl));
  for (const config of state.configs) {
    assert.equal(config.max, 3);
    assert.equal(config.connectionTimeoutMillis, 15_000);
  }
});
