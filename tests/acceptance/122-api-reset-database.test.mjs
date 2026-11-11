import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { ComplaintStore } from '../../api/dist/store.js';

async function setup(t) {
  const records = new Map();
  let finishSave;
  let holdWrites = false;
  let failWrites = false;
  let replacements = 0;
  const database = {
    load: async () => [],
    async save(item) {
      if (holdWrites) await new Promise(resolve => { finishSave = resolve; });
      if (failWrites) throw new Error('database temporarily unavailable');
      records.set(item.id, structuredClone(item));
    },
    async replaceAll(items) {
      replacements += 1;
      records.clear();
      for (const item of items) records.set(item.id, structuredClone(item));
    },
    close: async () => {},
  };
  const store = new ComplaintStore(undefined, database);
  store.seed();
  await store.flush();
  const seed = store.list();
  const added = { ...structuredClone(seed[0]), id: 'concurrent-reset-test', number: 'A-999' };
  t.after(async () => {
    holdWrites = false;
    failWrites = false;
    finishSave?.();
    await store.flush();
  });
  return { store, seed, added, database, records,
    hold() { holdWrites = true; },
    fail() { failWrites = true; },
    release() { holdWrites = false; finishSave?.(); },
    get replacements() { return replacements; },
  };
}

test('#122 reset waits for a pending database write so deleted complaints cannot reappear', async t => {
  const state = await setup(t);
  state.hold();
  state.store.save(state.added);
  const reset = state.store.reset();
  await setImmediate();
  const replacedBeforeSaveFinished = state.replacements;
  state.release();
  await reset;
  await state.store.flush();
  assert.equal(replacedBeforeSaveFinished, 0, 'replaceAll must follow the in-flight save');
  assert.equal(state.records.has(state.added.id), false);
  assert.deepEqual([...state.records.values()], state.seed);
  assert.deepEqual(state.store.list(), state.seed);
});

test('#122 a successful reset clears a previous database write error', async t => {
  const state = await setup(t);
  state.fail();
  state.store.save(state.added);
  await state.store.flush();
  assert.ok(state.store.writeError);
  await state.store.reset();
  assert.equal(state.store.writeError, null);
  assert.deepEqual(state.store.list(), state.seed);
  assert.equal(state.records.has(state.added.id), false);
});

test('#122 a failed database reset preserves the existing memory snapshot', async t => {
  const state = await setup(t);
  state.store.save(state.added);
  await state.store.flush();
  const before = state.store.list();
  state.database.replaceAll = async () => { throw new Error('reset failed'); };
  await assert.rejects(state.store.reset(), /reset failed/);
  assert.deepEqual(state.store.list(), before);
});

test('#122 writes during reset fail explicitly instead of being silently discarded', async t => {
  const state = await setup(t);
  let releaseReset;
  const replace = state.database.replaceAll;
  state.database.replaceAll = async items => {
    await new Promise(resolve => { releaseReset = resolve; });
    await replace(items);
  };
  const reset = state.store.reset();
  await setImmediate();
  let rejected = false;
  try { state.store.save(state.added); } catch { rejected = true; }
  releaseReset();
  await reset;
  assert.equal(rejected, true, 'a write must not report success and then disappear');
  state.store.save(state.added);
  await state.store.flush();
  assert.ok(state.records.has(state.added.id), 'writes resume after reset');
});
