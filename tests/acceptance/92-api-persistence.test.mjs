import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

function setup(t, enabled = true) {
  const dir = mkdtempSync(join(tmpdir(), 'ef-persist-'));
  const path = join(dir, 'папка с пробелами', 'records.json');
  const previous = { PERSIST_FILE: process.env.PERSIST_FILE, NODE_ENV: process.env.NODE_ENV };
  if (enabled) process.env.PERSIST_FILE = path; else delete process.env.PERSIST_FILE;
  process.env.NODE_ENV = 'test';
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('ef-persist-'));
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, path };
}
const create = app => app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' },
  payload: { type: 'problem', categoryId: 'cross_department', description: 'Сохранить между перезапусками.' } });

test('#92 file storage preserves new records and unique next numbers across new buildApp instances', async t => {
  const { path } = setup(t);
  const first = buildApp(); t.after(() => first.close());
  const created = (await create(first)).json();
  await first.close();
  const second = buildApp(); t.after(() => second.close());
  assert.deepEqual(second.store.get(created.id), created);
  const next = (await create(second)).json();
  assert.equal(next.number, 'A-022'); assert.notEqual(next.id, created.id);
  const disk = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(disk.length, 22);
});

test('#92 no flag keeps isolated memory plus seed and creates no persistence file', async t => {
  const { dir } = setup(t, false);
  const app = buildApp(); t.after(() => app.close());
  await create(app);
  const restarted = buildApp(); t.after(() => restarted.close());
  assert.equal(restarted.store.list().length, 20);
  assert.deepEqual(readdirSync(dir), []);
});

test('#92 empty, malformed and invalid-record files warn and recover the seed', async t => {
  const { path } = setup(t);
  const initial = buildApp(); await initial.close();
  const warnings = t.mock.method(process, 'emitWarning', () => {});
  for (const text of ['', '{broken', '[{"id":"bad"}]']) {
    writeFileSync(path, text, 'utf8');
    const app = buildApp();
    assert.equal(app.store.list().length, 20);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).length, 20);
    await app.close();
  }
  assert.equal(warnings.mock.calls.length, 3);
  assert.ok(warnings.mock.calls.every(call => String(call.arguments[0]).includes('seed')));
});

test('#92 rapid writes leave valid complete JSON and no temporary files', async t => {
  const { path } = setup(t);
  const app = buildApp(); t.after(() => app.close());
  const results = await Promise.all(Array.from({ length: 25 }, () => create(app)));
  assert.ok(results.every(response => response.statusCode === 201));
  const disk = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(disk.length, 45);
  assert.equal(new Set(disk.map(item => item.number)).size, 45);
  assert.deepEqual(readdirSync(dirname(path)), ['records.json']);
  assert.deepEqual(disk, app.store.list());
});
