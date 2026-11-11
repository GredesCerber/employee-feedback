// Независимые приёмочные тесты для #123 (анонимная подача), написаны в рамках #213.
// Опираются на contracts/api.yaml (x-anonymity, AnonymousActor). Файл переносится в tests/acceptance/ без изменений,
// поэтому корень репозитория ищется вверх по дереву, а не через фиксированную глубину ../..
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

let root = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(root, 'contracts', 'api.yaml'))) {
  const parent = dirname(root);
  assert.notEqual(parent, root, 'repository root with contracts/api.yaml not found');
  root = parent;
}
const { buildApp } = await import(pathToFileURL(join(root, 'api', 'dist', 'app.js')).href);
const requireApi = createRequire(join(root, 'api', 'package.json'));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false });
requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(join(root, 'contracts', 'api.yaml'), 'utf8')), 'contract');
const schema = (name) => ajv.compile({ $ref: `contract#/components/schemas/${name}` });
const complaintSchema = schema('Complaint');
const listSchema = schema('ComplaintList');
const notificationsSchema = schema('NotificationList');
const anonymousActor = schema('AnonymousActor');

const AUTHOR_ID = 'employee-1';
const AUTHOR_NAME = 'Сотрудник закупок';
const MARK = 'Анонимныймаркер123';
const body = (extra = {}) => ({ type: 'problem', categoryId: 'cross_department',
  description: `${MARK} на складе нет нормальной вентиляции.`, proposedSolution: 'Поставить вентиляцию.', ...extra });
const req = (app, method, url, payload, user = 'manager-1') => app.inject({ method, url,
  headers: user ? { 'x-demo-user': user } : {}, ...(payload === undefined ? {} : { payload }) });
const json = (response, status) => { assert.equal(response.statusCode, status, response.body); return response.json(); };
const valid = (validate, value) => assert.ok(validate(value), JSON.stringify(validate.errors));
const leaks = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return [AUTHOR_ID, AUTHOR_NAME].filter((needle) => text.includes(needle));
};
const noLeak = (value, label) => assert.deepEqual(leaks(value), [], `${label}: author identity leaked`);

async function setup(t, extra = { anonymous: true }, categoryId = 'cross_department') {
  const app = buildApp(); t.after(() => app.close());
  const item = json(await req(app, 'POST', '/complaints', body({ ...extra, categoryId }), AUTHOR_ID), 201);
  return { app, item, path: `/complaints/${item.id}` };
}
const readers = ['manager-1', 'admin-1'];
// Surfaces delivered by other tasks (#119 export, #120 notifications, #121 similar, #150/#151 analytics) may not be merged yet:
// an unrouted path is skipped, but once the route exists it must hide the author.
const unrouted = (response) => response.statusCode === 404 && /^Route \S+ not found/.test(response.json().message ?? '');

test('#123 anonymous:true creates the complaint; managers and admins get AnonymousActor without id', async t => {
  const { item, app, path } = await setup(t);
  valid(complaintSchema, item);
  assert.equal(item.anonymous, true);
  assert.equal(item.status, 'new');
  for (const user of readers) {
    const detail = json(await req(app, 'GET', path, undefined, user), 200);
    valid(complaintSchema, detail);
    assert.equal(detail.id, item.id);
    assert.equal(detail.anonymous, true);
    assert.deepEqual(detail.author, { name: 'Аноним' }, `${user}: only the redacted name is allowed`);
    valid(anonymousActor, detail.author);
    noLeak(detail, `${user} detail`);
    const list = json(await req(app, 'GET', '/complaints?limit=100', undefined, user), 200);
    valid(listSchema, list);
    const row = list.items.find((entry) => entry.id === item.id);
    assert.ok(row, `${user}: anonymous complaint is listed`);
    assert.deepEqual(row.author, { name: 'Аноним' });
    noLeak(row, `${user} list`);
  }
});

test('#123 the author is stored internally: ownership and visibility are preserved', async t => {
  const { app, item, path } = await setup(t);
  const stored = app.store.list().find((entry) => entry.id === item.id);
  assert.equal(stored.author.id, AUTHOR_ID, 'real author is kept inside the store');
  assert.equal(json(await req(app, 'GET', path, undefined, 'employee-2'), 404).code, 'NOT_FOUND');
  const list2 = json(await req(app, 'GET', '/complaints?limit=100', undefined, 'employee-2'), 200);
  assert.equal(list2.items.some((entry) => entry.id === item.id), false, 'other employee cannot see it');
});

test('#123 the author opens their own anonymous complaint and sees their own identity', async t => {
  const { app, item, path } = await setup(t);
  const own = json(await req(app, 'GET', path, undefined, AUTHOR_ID), 200);
  valid(complaintSchema, own);
  assert.equal(own.anonymous, true);
  assert.equal(own.author.id, AUTHOR_ID);
  assert.equal(own.author.name, AUTHOR_NAME);
  const list = json(await req(app, 'GET', '/complaints?limit=100', undefined, AUTHOR_ID), 200);
  valid(listSchema, list);
  const row = list.items.find((entry) => entry.id === item.id);
  assert.ok(row, 'author sees the anonymous complaint in their list');
  assert.equal(row.author.id, AUTHOR_ID);
});

test('#123 the author can answer a clarification request and sees the whole thread', async t => {
  const { app, path } = await setup(t);
  const asked = json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Уточните, о каком складе речь.' }), 201);
  valid(complaintSchema, asked);
  assert.equal(asked.status, 'awaiting_clarification');
  noLeak(asked, 'manager mutation response');
  const answered = json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'О складе номер два.' }, AUTHOR_ID), 201);
  valid(complaintSchema, answered);
  assert.equal(answered.status, 'in_review');
  const own = json(await req(app, 'GET', path, undefined, AUTHOR_ID), 200);
  assert.deepEqual(own.comments.map((comment) => comment.kind), ['clarification_request', 'clarification_response']);
  assert.equal(own.comments[0].author.id, 'manager-1', 'manager stays a regular User for the author');
  assert.equal(own.comments[1].author.id, AUTHOR_ID, 'author sees their own comment as themselves');
  const other = await req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Чужой комментарий.' }, 'employee-2');
  assert.equal(other.statusCode, 404);
});

test('#123 the author reply in the thread is signed «Автор (аноним)» for manager and admin', async t => {
  const { app, path } = await setup(t);
  json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Уточните детали.' }), 201);
  const answered = json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Детали: второй склад.' }, AUTHOR_ID), 201);
  assert.ok(answered.comments.length >= 2);
  json(await req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Обычный комментарий автора.' }, AUTHOR_ID), 201);
  for (const user of readers) {
    const detail = json(await req(app, 'GET', path, undefined, user), 200);
    valid(complaintSchema, detail);
    const response = detail.comments.find((comment) => comment.kind === 'clarification_response');
    assert.deepEqual(response.author, { name: 'Автор (аноним)' }, `${user}: clarification response author`);
    const plain = detail.comments.find((comment) => comment.text === 'Обычный комментарий автора.');
    assert.deepEqual(plain.author, { name: 'Автор (аноним)' }, `${user}: ordinary author comment`);
    const request = detail.comments.find((comment) => comment.kind === 'clarification_request');
    assert.equal(request.author.id, 'manager-1', `${user}: manager comment remains a User`);
    assert.equal(detail.author.name, 'Аноним', 'Complaint.author keeps the «Аноним» label');
    const authorEvents = detail.history.filter((event) => event.actor && event.actor.name === 'Автор (аноним)');
    assert.ok(authorEvents.length >= 2, `${user}: author actions in history are signed «Автор (аноним)»`);
    for (const event of authorEvents) assert.deepEqual(event.actor, { name: 'Автор (аноним)' });
    assert.ok(detail.history.some((event) => event.actor?.id === 'manager-1'), 'manager history actor remains a User');
    noLeak(detail, `${user} detail`);
  }
});

test('#123 history stays redacted after manager actions: assignment, status and decision', async t => {
  const { app, path } = await setup(t);
  for (const [method, suffix, payload] of [
    ['PATCH', '/assignment', { assigneeId: 'manager-1' }],
    ['PATCH', '/status', { status: 'in_review' }],
    ['POST', '/decision', { outcome: 'implemented', explanation: 'Вентиляцию поставили.', actions: 'Заказ выполнен.' }],
  ]) {
    const result = await req(app, method, path + suffix, payload);
    assert.ok([200, 201].includes(result.statusCode), `${suffix}: ${result.statusCode} ${result.body}`);
    valid(complaintSchema, result.json());
    noLeak(result.json(), `response of ${suffix}`);
  }
  for (const user of readers) {
    const detail = json(await req(app, 'GET', path, undefined, user), 200);
    assert.equal(detail.status, 'implemented');
    assert.equal(detail.history[0].kind, 'created');
    assert.deepEqual(detail.history[0].actor, { name: 'Автор (аноним)' }, `${user}: creation event is attributed to the anonymous author`);
    noLeak(detail, `${user} detail after decision`);
  }
  const own = json(await req(app, 'GET', path, undefined, AUTHOR_ID), 200);
  assert.equal(own.decision.outcome, 'implemented', 'author sees the decision');
});

test('#123 every endpoint hides the anonymous author: list, search, export, summary, digest, trends, similar, notifications', async t => {
  const { app, item, path } = await setup(t, { anonymous: true }, 'no_rule_demo');
  json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Нужны подробности.' }), 201);
  json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Подробности добавлены.' }, AUTHOR_ID), 201);
  for (const user of readers) {
    for (const query of ['', `?q=${encodeURIComponent(MARK)}`, '?categoryId=no_rule_demo', `?departmentId=${item.departmentId}`, '?limit=100']) {
      const list = json(await req(app, 'GET', `/complaints${query}`, undefined, user), 200);
      valid(listSchema, list);
      const row = list.items.find((entry) => entry.id === item.id);
      if (query.includes('q=') || query.includes('no_rule')) assert.ok(row, `${user}: ${query} finds the complaint`);
      if (row) { assert.deepEqual(row.author, { name: 'Аноним' }); noLeak(row, `${user} list ${query}`); }
    }
    for (const probe of [AUTHOR_ID, AUTHOR_NAME, 'Сотрудник']) {
      const hit = json(await req(app, 'GET', `/complaints?limit=100&q=${encodeURIComponent(probe)}`, undefined, user), 200);
      assert.equal(hit.items.some((entry) => entry.id === item.id), false, `${user}: search "${probe}" does not reveal the author`);
    }
    const csv = await req(app, 'GET', '/complaints/export?q=' + encodeURIComponent(MARK), undefined, user);
    assert.equal(csv.statusCode, 200, csv.body);
    assert.match(csv.headers['content-type'], /^text\/csv/);
    assert.ok(csv.body.startsWith('﻿'), 'UTF-8 BOM');
    assert.ok(csv.body.includes(item.number), `${user}: anonymous complaint is exported`);
    noLeak(csv.body, `${user} export body`);
    noLeak(JSON.stringify(csv.headers), `${user} export headers`);
    const similar = await req(app, 'GET', '/complaints/similar?text=' + encodeURIComponent(body().description), undefined, user);
    assert.equal(similar.statusCode, 200, similar.body);
    noLeak(similar.body, `${user} similar`);
    const trends = await req(app, 'GET', '/analytics/trends', undefined, user);
    assert.equal(trends.statusCode, 200, trends.body);
    noLeak(trends.body, `${user} trends`);
    const digest = await req(app, 'GET', '/summary/digest', undefined, user);
    assert.equal(digest.statusCode, 200, digest.body);
    noLeak(digest.body, `${user} digest`);
  }
  const summary = await req(app, 'GET', '/summary', undefined, 'admin-1');
  assert.equal(summary.statusCode, 200, summary.body);
  noLeak(summary.body, 'summary');
  const rawFeed = await req(app, 'GET', '/notifications', undefined, 'manager-1');
  if (!unrouted(rawFeed)) {
    const managerFeed = json(rawFeed, 200);
    valid(notificationsSchema, managerFeed);
    const mine = managerFeed.items.filter((entry) => entry.complaintId === item.id);
    assert.ok(mine.length >= 1, 'manager is notified about the unassigned anonymous complaint');
    noLeak(mine, 'manager notifications');
  }
});

test('#123 the author feed works for anonymous complaints and admin is not a feed recipient', async t => {
  const { app, item, path } = await setup(t, { anonymous: true }, 'no_rule_demo');
  json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Нужны подробности.' }), 201);
  const rawFeed = await req(app, 'GET', '/notifications', undefined, AUTHOR_ID);
  if (unrouted(rawFeed)) return;
  const feed = json(rawFeed, 200);
  valid(notificationsSchema, feed);
  const event = feed.items.find((entry) => entry.complaintId === item.id && entry.kind === 'clarification_requested');
  assert.ok(event, 'author still receives the clarification notification');
  assert.equal(event.href, `/my/${item.id}`);
  assert.equal((await req(app, 'GET', '/notifications', undefined, 'admin-1')).statusCode, 403);
});

test('#123 «Ограничения анонимности» are documented in api/concept/access.md', () => {
  const text = readFileSync(join(root, 'api', 'concept', 'access.md'), 'utf8');
  const match = /^#{2,4}\s+.*Ограничения анонимности.*$/m.exec(text);
  assert.ok(match, 'section heading «Ограничения анонимности» is missing');
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/^#{1,4}\s/m);
  const section = (next === -1 ? rest : rest.slice(0, next)).toLowerCase();
  for (const word of ['вложени', 'текст', 'косвенн', 'админ']) assert.ok(section.includes(word), `section mentions "${word}"`);
});

test('#123 without the anonymous field behaviour is unchanged (and false equals omitted)', async t => {
  for (const extra of [{}, { anonymous: false }]) {
    const { app, item, path } = await setup(t, extra);
    valid(complaintSchema, item);
    assert.ok(item.anonymous === undefined || item.anonymous === false);
    assert.equal(item.author.id, AUTHOR_ID);
    assert.equal(item.author.name, AUTHOR_NAME);
    for (const user of readers) {
      const detail = json(await req(app, 'GET', path, undefined, user), 200);
      valid(complaintSchema, detail);
      assert.ok(detail.anonymous === undefined || detail.anonymous === false);
      assert.deepEqual(detail.author, { id: AUTHOR_ID, name: AUTHOR_NAME, role: 'employee', departmentId: 'procurement' });
      assert.equal(detail.history[0].actor.id, AUTHOR_ID);
    }
    json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Вопрос.' }), 201);
    const answered = json(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Ответ.' }, AUTHOR_ID), 201);
    assert.equal(answered.comments.at(-1).author.id, AUTHOR_ID);
    assert.notEqual(answered.comments.at(-1).author.name, 'Автор (аноним)');
  }
});

test('#123 anonymous input is validated: only booleans, only employees', async t => {
  const app = buildApp(); t.after(() => app.close());
  for (const value of ['true', 'yes', 1, 0, null, {}, []]) {
    const response = await req(app, 'POST', '/complaints', body({ anonymous: value }), AUTHOR_ID);
    assert.equal(response.statusCode, 422, `anonymous=${JSON.stringify(value)}: ${response.body}`);
  }
  const before = app.store.list();
  assert.equal((await req(app, 'POST', '/complaints', body({ anonymous: true }), 'manager-1')).statusCode, 403);
  assert.equal((await req(app, 'POST', '/complaints', body({ anonymous: true }), 'admin-1')).statusCode, 403);
  assert.equal((await req(app, 'POST', '/complaints', body({ anonymous: true }), null)).statusCode, 401);
  assert.deepEqual(app.store.list(), before, 'rejected requests change nothing');
});
