// #122: POST /demo/reset — сброс демо-данных к seed (только админ, выключается DEMO_RESET_ENABLED=false).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const payload = { type: 'problem', categoryId: 'cross_department', description: 'Секретный текст обращения для проверки журнала.' };

function env(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });
}
const call = (app, user, method = 'POST', url = '/demo/reset') =>
  app.inject({ method, url, headers: user ? { 'x-demo-user': user } : {} });
const create = (app) => app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' }, payload });
const maxNumber = (app) => Math.max(...app.store.list().map(item => Number(item.number.slice(2))));

test('#122 admin reset replaces all complaints with the seed, restarts numbering and returns loadedCount', async t => {
  env(t, { DEMO_RESET_ENABLED: undefined, PERSIST_FILE: undefined, NODE_ENV: 'test' });
  const app = buildApp(); t.after(() => app.close());
  const seed = app.store.list();
  const seedMax = maxNumber(app);
  const created = await create(app);
  assert.equal(created.statusCode, 201);
  const id = created.json().id;
  await app.inject({ method: 'PATCH', url: `/complaints/${seed[0].id}/status`, headers: { 'x-demo-user': 'manager-1' }, payload: { status: 'in_review' } });
  assert.notDeepEqual(app.store.list(), seed);

  const response = await call(app, 'admin-1');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { loadedCount: seed.length });
  assert.deepEqual(app.store.list(), seed);
  assert.equal(app.store.get(id), undefined);
  const next = await create(app);
  assert.equal(next.json().number, `A-${String(seedMax + 1).padStart(3, '0')}`);
});

test('#122 non-admin roles get 403, missing identity 401, and data is untouched', async t => {
  env(t, { DEMO_RESET_ENABLED: undefined, PERSIST_FILE: undefined });
  const app = buildApp(); t.after(() => app.close());
  await create(app);
  const before = app.store.list();
  for (const user of ['employee-1', 'manager-1']) {
    const response = await call(app, user);
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, 'FORBIDDEN');
  }
  assert.equal((await call(app, undefined)).statusCode, 401);
  assert.deepEqual(app.store.list(), before);
});

test('#122 DEMO_RESET_ENABLED=false returns 404 NOT_FOUND for admin without changing data; non-admin still 403', async t => {
  env(t, { DEMO_RESET_ENABLED: 'false', PERSIST_FILE: undefined });
  const app = buildApp(); t.after(() => app.close());
  await create(app);
  const before = app.store.list();
  const response = await call(app, 'admin-1');
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().code, 'NOT_FOUND');
  assert.deepEqual(app.store.list(), before);
  assert.equal((await call(app, 'employee-1')).statusCode, 403);
});

test('#122 any other DEMO_RESET_ENABLED value keeps the reset enabled', async t => {
  env(t, { DEMO_RESET_ENABLED: 'true', PERSIST_FILE: undefined });
  const app = buildApp(); t.after(() => app.close());
  assert.equal((await call(app, 'admin-1')).statusCode, 200);
});

test('#122 with PERSIST_FILE the file is overwritten with the seed', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'reset-122-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'data.json');
  env(t, { DEMO_RESET_ENABLED: undefined, PERSIST_FILE: file });
  const app = buildApp(); t.after(() => app.close());
  const seed = app.store.list();
  const created = await create(app);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).length, seed.length + 1);
  const response = await call(app, 'admin-1');
  assert.equal(response.statusCode, 200);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(saved, seed);
  assert.ok(!saved.some(item => item.id === created.json().id));
});

test('#122 failed persistence leaves the store unchanged and returns 500', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'reset-122-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  env(t, { DEMO_RESET_ENABLED: undefined, PERSIST_FILE: join(dir, 'data.json') });
  const app = buildApp({ logger: false }); t.after(() => app.close());
  await create(app);
  const before = app.store.list();
  // A directory in place of the snapshot makes the atomic rename fail.
  rmSync(join(dir, 'data.json'));
  writeFileSync(join(dir, 'blocker'), 'x');
  process.env.PERSIST_FILE = join(dir, 'blocker', 'data.json');
  app.store.persistence.path = join(dir, 'blocker', 'data.json');
  const response = await call(app, 'admin-1');
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().code, 'INTERNAL_ERROR');
  assert.deepEqual(app.store.list(), before);
});

test('#122 reset is written to the request log without complaint text', async t => {
  env(t, { DEMO_RESET_ENABLED: undefined, PERSIST_FILE: undefined });
  let output = '';
  const stream = new Writable({ write(chunk, _encoding, done) { output += chunk; done(); } });
  const app = buildApp({ logger: { level: 'info', stream } }); t.after(() => app.close());
  await create(app);
  const response = await call(app, 'admin-1');
  assert.equal(response.statusCode, 200);
  const entries = output.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const entry = entries.find(item => item.event === 'demo_reset');
  assert.ok(entry, 'событие demo_reset записано');
  assert.equal(entry.actorId, 'admin-1');
  assert.equal(entry.loadedCount, response.json().loadedCount);
  assert.ok(!output.includes('Секретный текст'), 'текст обращений не попадает в журнал');
});
