import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildHostedApp } from '../dist/app.js';

/** Fake durable storage: survives "restarts" of the app, no network. */
function fakePersistence() {
  const rows = new Map();
  return {
    rows,
    load: async () => [...rows.values()].map(item => structuredClone(item)),
    save: async item => { rows.set(item.id, structuredClone(item)); },
    close: async () => {},
  };
}
const newComplaint = { type: 'problem', categoryId: 'cross_department', description: 'Нужна ясная заявка.' };

test('complaints survive an app restart when persistence is configured', async () => {
  const persistence = fakePersistence();
  const first = await buildHostedApp({}, { database: persistence });
  const created = await first.inject({ method: 'POST', url: '/complaints', payload: newComplaint,
    headers: { 'x-demo-user': 'employee-1' } });
  assert.equal(created.statusCode, 201, created.body);
  const { id } = created.json();
  await first.close();

  const second = await buildHostedApp({}, { database: persistence });
  const fetched = await second.inject({ url: `/complaints/${id}`, headers: { 'x-demo-user': 'employee-1' } });
  assert.equal(fetched.statusCode, 200);
  assert.equal(second.store.list().length, persistence.rows.size);
  await second.close();
});

test('seed is stored once and not duplicated on later starts', async () => {
  const persistence = fakePersistence();
  const first = await buildHostedApp({}, { database: persistence });
  await first.close();
  const count = persistence.rows.size;
  assert.ok(count > 0);
  const second = await buildHostedApp({}, { database: persistence });
  await second.close();
  assert.equal(persistence.rows.size, count);
});

test('a failing database does not break requests', async () => {
  const persistence = { ...fakePersistence(), save: async () => { throw new Error('db down'); } };
  const app = await buildHostedApp({}, { database: persistence });
  const response = await app.inject({ method: 'POST', url: '/complaints', payload: newComplaint,
    headers: { 'x-demo-user': 'employee-1' } });
  assert.equal(response.statusCode, 201);
  await app.close();
});

test('serves the built frontend, SPA routes and the /api prefix from one service', async t => {
  const webRoot = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>app</title>');
  const app = await buildHostedApp({}, { webRoot });
  t.after(() => app.close());
  const page = await app.inject({ url: '/queue/A-001', headers: { accept: 'text/html' } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<title>app<\/title>/);
  const health = await app.inject({ url: '/api/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, 'ok');
  const list = await app.inject({ url: '/api/complaints', headers: { 'x-demo-user': 'manager-1' } });
  assert.equal(list.statusCode, 200);
  const missing = await app.inject({ url: '/api/nope', headers: { accept: 'application/json' } });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().code, 'NOT_FOUND');
});
