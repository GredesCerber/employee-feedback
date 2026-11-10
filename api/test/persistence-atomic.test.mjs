import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { ComplaintStore } from '../dist/store.js';

test('failed atomic replacement leaves prior snapshot and memory intact and removes temp file', t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'ef-atomic-'));
  t.after(() => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('ef-atomic-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const path = join(dir, 'snapshot.json');
  const store = new ComplaintStore(path); store.seed();
  const before = store.list(), bytes = fs.readFileSync(path, 'utf8');
  const changed = store.get('complaint-1'); changed.description = 'Unsaved change';
  t.mock.method(fs, 'renameSync', () => { throw new Error('simulated disk failure'); });
  assert.throws(() => store.save(changed), /simulated disk failure/);
  assert.deepEqual(store.list(), before);
  assert.equal(fs.readFileSync(path, 'utf8'), bytes);
  assert.deepEqual(fs.readdirSync(dir), ['snapshot.json']);
});
