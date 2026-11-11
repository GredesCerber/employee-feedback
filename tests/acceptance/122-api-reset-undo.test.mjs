import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const call = (app, method, url, user, payload) => app.inject({ method, url,
  headers: { 'x-demo-user': user }, ...(payload === undefined ? {} : { payload }) });

test('#122 resetting the demo removes undo eligibility and restores the seed notification feed', async t => {
  const app = buildApp();
  t.after(() => app.close());
  const initialFeed = (await call(app, 'GET', '/notifications', 'employee-1')).json().items;
  const seedItem = app.store.list().find(item => item.status === 'new');
  const path = `/complaints/${seedItem.id}`;
  const changed = await call(app, 'PATCH', `${path}/status`, 'manager-1', { status: 'in_review' });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().canUndo, true);
  await call(app, 'POST', `${path}/comments`, 'manager-1', { kind: 'clarification_request', text: 'Уточните детали до сброса.' });
  const reset = await call(app, 'POST', '/demo/reset', 'admin-1');
  assert.equal(reset.statusCode, 200, reset.body);
  const restored = await call(app, 'GET', path, 'manager-1');
  assert.equal(restored.json().canUndo, false);
  assert.equal(restored.json().undoExpiresAt, null);
  assert.equal(restored.json().status, seedItem.status);
  const undo = await call(app, 'POST', `${path}/undo`, 'manager-1');
  assert.equal(undo.statusCode, 409);
  assert.equal(undo.json().code, 'NOTHING_TO_UNDO');
  assert.deepEqual((await call(app, 'GET', '/notifications', 'employee-1')).json().items, initialFeed);
});
