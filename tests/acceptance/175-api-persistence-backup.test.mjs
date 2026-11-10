import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

function setup(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'ef-backup-'));
  const path = join(dir, 'данные с пробелами.json');
  const previous = { PERSIST_FILE: process.env.PERSIST_FILE, NODE_ENV: process.env.NODE_ENV };
  process.env.PERSIST_FILE = path; process.env.NODE_ENV = 'test';
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('ef-backup-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const warnings = t.mock.method(process, 'emitWarning', () => {});
  const errors = t.mock.method(console, 'error', () => {});
  return { dir, path, warnings, errors, backups: () => fs.readdirSync(dir).filter(name => name.startsWith(`${basename(path)}.bak-`)) };
}

test('#175 invalid JSON, empty files and invalid schemas are backed up byte-for-byte before seed recovery', async t => {
  const { dir, path, backups, warnings } = setup(t);
  const invalid = [['{private broken', 'json_parse'], ['', 'json_parse'], ['[{"id":"bad"}]', 'schema_validation'], ['{"not":"an array"}', 'schema_validation']];
  for (const [text, reason] of invalid) {
    const before = new Set(backups());
    fs.writeFileSync(path, text);
    const app = buildApp(); t.after(() => app.close());
    assert.equal(app.store.list().length, 20);
    assert.equal(JSON.parse(fs.readFileSync(path, 'utf8')).length, 20);
    const added = backups().filter(name => !before.has(name));
    assert.equal(added.length, 1);
    assert.match(added[0].slice(`${basename(path)}.bak-`.length), /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(!added[0].includes(':'));
    assert.equal(fs.readFileSync(join(dir, added[0]), 'utf8'), text);
    const log = JSON.parse(String(warnings.mock.calls.at(-1).arguments[0]));
    assert.equal(log.level, 'warn'); assert.equal(log.path, path);
    assert.equal(log.backupPath, join(dir, added[0])); assert.equal(log.reason, reason);
    assert.ok(!JSON.stringify(log).includes('private broken'));
    await app.close();
  }
});

test('#175 repeated corrupt starts at the same clock instant preserve every backup', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T00:00:00Z') });
  const { dir, path, backups } = setup(t);
  for (const text of ['{one', '{two', '{three']) {
    fs.writeFileSync(path, text);
    const app = buildApp(); await app.close();
  }
  assert.equal(backups().length, 3);
  assert.deepEqual(backups().map(name => fs.readFileSync(join(dir, name), 'utf8')).sort(), ['{one', '{three', '{two']);
});

test('#175 failed backup keeps API alive and protects the original until backup succeeds', async t => {
  const { dir, path, backups, errors } = setup(t);
  const original = '{valuable damaged data'; fs.writeFileSync(path, original);
  const rename = fs.renameSync;
  const mockedRename = t.mock.method(fs, 'renameSync', (source, target) => {
    if (source === path) throw Object.assign(new Error('simulated denied backup'), { code: 'EACCES' });
    return rename(source, target);
  });
  const app = buildApp(); t.after(() => app.close());
  assert.equal((await app.inject('/health')).statusCode, 200);
  assert.equal(app.store.list().length, 20);
  assert.equal(fs.readFileSync(path, 'utf8'), original);
  assert.deepEqual(backups(), []);
  const request = { method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' }, payload: { type: 'problem', categoryId: 'cross_department', description: 'Не терять исходный файл.' } };
  assert.equal((await app.inject(request)).statusCode, 500);
  assert.equal(app.store.list().length, 20);
  assert.equal(fs.readFileSync(path, 'utf8'), original);
  assert.ok(errors.mock.calls.some(call => {
    const log = JSON.parse(String(call.arguments[0]));
    return log.level === 'error' && log.path === path && log.errorCode === 'EACCES';
  }));
  mockedRename.mock.restore();
  assert.equal((await app.inject(request)).statusCode, 201);
  assert.equal(backups().length, 1);
  assert.equal(fs.readFileSync(join(dir, backups()[0]), 'utf8'), original);
  assert.equal(JSON.parse(fs.readFileSync(path, 'utf8')).length, 21);
});

test('#175 valid snapshots and disabled persistence create no backup or warning', async t => {
  const { path, backups, warnings, errors } = setup(t);
  const first = buildApp(); await first.close();
  const valid = fs.readFileSync(path, 'utf8');
  const second = buildApp(); await second.close();
  assert.equal(fs.readFileSync(path, 'utf8'), valid);
  delete process.env.PERSIST_FILE;
  const memory = buildApp(); await memory.close();
  assert.deepEqual(backups(), []);
  assert.equal(warnings.mock.calls.length, 0); assert.equal(errors.mock.calls.length, 0);
});
