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
const req = (app, method, url, payload, user = 'manager-1') => app.inject({ method, url,
  headers: { 'x-demo-user': user }, ...(payload === undefined ? {} : { payload }) });
async function setup(t) {
  const app = buildApp(); t.after(() => app.close());
  const created = await req(app, 'POST', '/complaints', { type: 'problem', categoryId: 'cross_department', description: 'Тест процесса.' }, 'employee-1');
  return { app, item: created.json(), path: `/complaints/${created.json().id}` };
}

test('#52 allowed transition appends actor/time history and first response', async t => {
  const { app, item, path } = await setup(t);
  const result = await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
  assert.equal(result.statusCode, 200);
  const changed = result.json();
  assert.ok(validate(changed), JSON.stringify(validate.errors));
  assert.equal(changed.status, 'in_review');
  assert.deepEqual(changed.history.slice(0, item.history.length), item.history);
  assert.equal(changed.history.at(-1).actor.id, 'manager-1');
  assert.equal(changed.history.at(-1).fromStatus, 'new');
  assert.equal(changed.history.at(-1).toStatus, 'in_review');
  assert.ok(Number.isFinite(Date.parse(changed.history.at(-1).createdAt)));
  assert.equal(changed.firstResponseAt, changed.history.at(-1).createdAt);
  const next = (await req(app, 'PATCH', `${path}/status`, { status: 'in_progress' })).json();
  assert.equal(next.firstResponseAt, changed.firstResponseAt);
});

test('#52 invalid known transition is 409 and does not change data or history', async t => {
  const { app, path } = await setup(t);
  const before = app.store.list();
  const result = await req(app, 'PATCH', `${path}/status`, { status: 'in_progress' });
  assert.equal(result.statusCode, 409);
  assert.equal(result.json().code, 'INVALID_TRANSITION');
  assert.ok(result.json().message.trim());
  assert.equal((await req(app, 'PATCH', `${path}/status`, { status: 'unknown' })).statusCode, 422);
  assert.deepEqual(app.store.list(), before);
});

test('#52 clarification and author response persist ordered comments and restore review', async t => {
  const { app, path } = await setup(t);
  const request = await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Уточните параметры.' });
  assert.equal(request.statusCode, 201);
  assert.equal(request.json().status, 'awaiting_clarification');
  const firstResponseAt = request.json().firstResponseAt;
  const waiting = app.store.list();
  assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Повтор.' })).statusCode, 409);
  assert.equal((await req(app, 'POST', `${path}/decision`, { outcome: 'closed', explanation: 'Готово.' })).statusCode, 409);
  assert.deepEqual(app.store.list(), waiting);
  const response = await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Параметры уточнены.' }, 'employee-1');
  assert.equal(response.statusCode, 201);
  const item = response.json();
  assert.ok(validate(item), JSON.stringify(validate.errors));
  assert.equal(item.status, 'in_review');
  assert.equal(item.firstResponseAt, firstResponseAt);
  assert.deepEqual(item.comments.map(c => c.text), ['Уточните параметры.', 'Параметры уточнены.']);
  assert.deepEqual(item.comments.map(c => c.author.id), ['manager-1', 'employee-1']);
  assert.deepEqual(item.comments, [...item.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
  assert.deepEqual(item.history, [...item.history].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
});

test('#52 every terminal decision requires explanation and becomes immutable, visible to author', async t => {
  for (const outcome of ['implemented', 'rejected', 'closed']) {
    const { app, path } = await setup(t);
    await req(app, 'PATCH', `${path}/status`, { status: 'in_review' });
    const before = app.store.list();
    for (const payload of [{ outcome }, { outcome, explanation: '   ' }]) {
      assert.equal((await req(app, 'POST', `${path}/decision`, payload)).statusCode, 422);
    }
    assert.deepEqual(app.store.list(), before);
    const result = await req(app, 'POST', `${path}/decision`, { outcome, explanation: 'Обоснованное решение.' });
    assert.equal(result.statusCode, 201);
    assert.ok(validate(result.json()), JSON.stringify(validate.errors));
    const visible = (await req(app, 'GET', path, undefined, 'employee-1')).json();
    assert.equal(visible.status, outcome);
    assert.equal(visible.decision.explanation, 'Обоснованное решение.');
    assert.equal(visible.decision.author.id, 'manager-1');
    assert.equal(visible.closedAt, visible.decision.createdAt);
    assert.equal(visible.overdue, false);
    const closed = app.store.list();
    assert.equal((await req(app, 'POST', `${path}/decision`, { outcome, explanation: 'Повтор.' })).statusCode, 409);
    assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Поздно.' })).statusCode, 409);
    assert.equal((await req(app, 'PATCH', `${path}/status`, { status: 'in_review' })).statusCode, 409);
    assert.deepEqual(app.store.list(), closed);
  }
});

test('#52 role restrictions and author-only clarification preserve data on rejection', async t => {
  const { app, path } = await setup(t);
  const before = app.store.list();
  assert.equal((await req(app, 'PATCH', `${path}/status`, { status: 'in_review' }, 'employee-1')).statusCode, 403);
  assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Вопрос.' }, 'employee-1')).statusCode, 403);
  assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Чужое.' }, 'employee-2')).statusCode, 404);
  assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Админ.' }, 'admin-1')).statusCode, 403);
  assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Ответ.' }, 'employee-1')).statusCode, 409);
  assert.deepEqual(app.store.list(), before);
  const ownComment = await req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Дополнение.' }, 'employee-1');
  assert.equal(ownComment.statusCode, 201);
  assert.equal(ownComment.json().firstResponseAt, null);
  assert.equal(ownComment.json().status, 'new');
});
