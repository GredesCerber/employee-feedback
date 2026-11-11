import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false });
requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8')), 'contract');
const validate = ajv.compile({ $ref: 'contract#/components/schemas/Complaint' });
const validateError = ajv.compile({ $ref: 'contract#/components/schemas/Error' });

const req = (app, method, url, payload, user = 'manager-1') => app.inject({ method, url,
  headers: { 'x-demo-user': user }, ...(payload === undefined ? {} : { payload }) });

async function setup(t, categoryId = 'no_rule_demo') {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-11T10:00:00.000Z') });
  const app = buildApp(); t.after(() => app.close());
  const created = await req(app, 'POST', '/complaints', { type: 'problem', categoryId, description: 'Тест отката.' }, 'employee-1');
  assert.equal(created.statusCode, 201);
  const item = created.json();
  t.mock.timers.tick(1000);
  return { app, item, path: `/complaints/${item.id}` };
}
const undo = (app, path, user = 'manager-1') => req(app, 'POST', `${path}/undo`, undefined, user);
const expectError = (result, status, code) => {
  assert.equal(result.statusCode, status, result.body);
  assert.ok(validateError(result.json()), JSON.stringify(validateError.errors));
  assert.equal(result.json().code, code);
};

test('#117 undo of a status change restores state, firstResponseAt and appends an undone event', async t => {
  const { app, item, path } = await setup(t);
  const changed = (await req(app, 'PATCH', `${path}/status`, { status: 'in_review' })).json();
  assert.equal(changed.status, 'in_review');
  assert.ok(changed.firstResponseAt);
  assert.equal(changed.canUndo, true);
  assert.equal(changed.undoExpiresAt, new Date(Date.parse(changed.updatedAt) + 600_000).toISOString());
  t.mock.timers.tick(5000);
  const result = await undo(app, path);
  assert.equal(result.statusCode, 200, result.body);
  const restored = result.json();
  assert.ok(validate(restored), JSON.stringify(validate.errors));
  assert.equal(restored.status, 'new');
  assert.equal(restored.firstResponseAt, null);
  assert.equal(restored.dueAt, item.dueAt);
  assert.equal(restored.nextAction, item.nextAction);
  assert.equal(restored.overdue, false);
  assert.deepEqual(restored.history.slice(0, changed.history.length), changed.history);
  assert.equal(restored.history.length, changed.history.length + 1);
  const event = restored.history.at(-1);
  assert.equal(event.kind, 'undone');
  assert.equal(event.actor.id, 'manager-1');
  assert.equal(event.fromStatus, 'in_review');
  assert.equal(event.toStatus, 'new');
  assert.ok(Date.parse(restored.updatedAt) > Date.parse(changed.updatedAt));
  assert.equal(restored.canUndo, false);
  assert.equal(restored.undoExpiresAt, null);
  assert.deepEqual((await req(app, 'GET', path)).json(), restored);
});

test('#117 undo of an assignment restores assignee and routing', async t => {
  const { app, item, path } = await setup(t);
  assert.equal(item.assignee, null);
  const assigned = await req(app, 'PATCH', `${path}/assignment`, { assigneeId: 'manager-2' });
  assert.equal(assigned.statusCode, 200);
  assert.equal(assigned.json().assignee.id, 'manager-2');
  assert.equal(assigned.json().canUndo, true);
  const restored = (await undo(app, path)).json();
  assert.ok(validate(restored), JSON.stringify(validate.errors));
  assert.equal(restored.assignee, null);
  assert.deepEqual(restored.routing, item.routing);
  assert.equal(restored.nextAction, item.nextAction);
  assert.equal(restored.history.at(-1).kind, 'undone');
});

test('#117 repeated undo unwinds the previous action while it is inside its window', async t => {
  const { app, item, path } = await setup(t);
  await req(app, 'PATCH', `${path}/assignment`, { assigneeId: 'manager-2' });
  t.mock.timers.tick(60_000);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  t.mock.timers.tick(60_000);
  const first = (await undo(app, path)).json();
  assert.equal(first.status, 'new');
  assert.equal(first.assignee.id, 'manager-2');
  assert.equal(first.canUndo, true);
  const second = (await undo(app, path)).json();
  assert.equal(second.assignee, null);
  assert.deepEqual(second.routing, item.routing);
  assert.equal(second.history.filter(event => event.kind === 'undone').length, 2);
  assert.equal(second.history.length, item.history.length + 4);
  expectError(await undo(app, path), 409, 'NOTHING_TO_UNDO');
});

test('#117 repeated undo stops at an action that is already outside its own window', async t => {
  const { app, path } = await setup(t);
  await req(app, 'PATCH', `${path}/assignment`, { assigneeId: 'manager-2' });
  t.mock.timers.tick(400_000);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  t.mock.timers.tick(250_000);
  assert.equal((await undo(app, path)).statusCode, 200);
  expectError(await undo(app, path), 409, 'UNDO_EXPIRED');
});

test('#117 window comes from UNDO_WINDOW_S and expires exactly at the deadline', async t => {
  const { app, path } = await setup(t);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  const before = app.store.list();
  t.mock.timers.tick(599_000);
  assert.equal((await req(app, 'GET', path)).json().canUndo, true);
  t.mock.timers.tick(1000);
  const view = (await req(app, 'GET', path)).json();
  assert.equal(view.canUndo, false);
  assert.equal(view.undoExpiresAt, null);
  expectError(await undo(app, path), 409, 'UNDO_EXPIRED');
  assert.deepEqual(app.store.list(), before);
});

test('#117 UNDO_WINDOW_S overrides the default window', async t => {
  const previous = process.env.UNDO_WINDOW_S;
  process.env.UNDO_WINDOW_S = '30';
  t.after(() => { if (previous === undefined) delete process.env.UNDO_WINDOW_S; else process.env.UNDO_WINDOW_S = previous; });
  const { app, path } = await setup(t);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  t.mock.timers.tick(29_000);
  assert.equal((await undo(app, path)).statusCode, 200);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  t.mock.timers.tick(30_000);
  expectError(await undo(app, path), 409, 'UNDO_EXPIRED');
});

test('#117 undo is unavailable when another manager acted last', async t => {
  const { app, path } = await setup(t);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' }, 'manager-1');
  await req(app, 'PATCH', `${path}/status`, { status: 'in_progress' }, 'manager-2');
  const before = app.store.list();
  expectError(await undo(app, path, 'manager-1'), 409, 'NOTHING_TO_UNDO');
  assert.deepEqual(app.store.list(), before);
  const other = (await req(app, 'GET', path, undefined, 'manager-1')).json();
  assert.equal(other.canUndo, false);
});

test('#117 comments, decisions and submissions cannot be undone', async t => {
  const { app, path, item } = await setup(t);
  expectError(await undo(app, path), 409, 'NOTHING_TO_UNDO');
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  const commented = await req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Комментарий.' });
  assert.equal(commented.statusCode, 201);
  assert.equal(commented.json().canUndo, false);
  const before = app.store.list();
  expectError(await undo(app, path), 409, 'NOTHING_TO_UNDO');
  assert.deepEqual(app.store.list(), before);
  assert.equal(item.history.at(-1).kind, 'created');
});

test('#117 completed complaint after a decision cannot be undone', async t => {
  const { app, path } = await setup(t);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  const decided = await req(app, 'POST', `${path}/decision`, { outcome: 'rejected', explanation: 'Отклонено.' });
  assert.equal(decided.statusCode, 201);
  const before = app.store.list();
  expectError(await undo(app, path), 409, 'NOTHING_TO_UNDO');
  assert.deepEqual(app.store.list(), before);
});

test('#117 only managers may undo; unknown users and complaints are rejected', async t => {
  const { app, path } = await setup(t);
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  expectError(await undo(app, path, 'employee-1'), 403, 'FORBIDDEN');
  expectError(await undo(app, path, 'admin-1'), 403, 'FORBIDDEN');
  expectError(await undo(app, path, 'nobody'), 401, 'UNAUTHENTICATED');
  expectError(await undo(app, '/complaints/missing-1'), 404, 'NOT_FOUND');
  const employeeView = (await req(app, 'GET', path, undefined, 'employee-1')).json();
  assert.equal('canUndo' in employeeView, false);
  assert.equal('undoExpiresAt' in employeeView, false);
});

test('#117 undo recomputes overdue state', async t => {
  const { app, path } = await setup(t, 'cross_department');
  await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  const restored = (await undo(app, path)).json();
  assert.equal(restored.overdue, false);
  assert.equal(restored.status, 'new');
});
