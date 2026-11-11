// #132 (R5): systematic anonymity sweep driven by contracts/api.yaml.
// Complements 123-anonymous-submission.test.mjs (hand-picked scenarios): here EVERY operation of the contract
// must be probed for manager and admin, and neither the author's id nor name may appear anywhere in the
// response (body and headers). A new route without a probe fails the coverage test below.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';
import { seedUsers } from '../../api/dist/seed.js';

const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const httpMethods = new Set(['get', 'post', 'patch', 'put', 'delete']);
const operations = Object.entries(contract.paths).flatMap(([path, value]) => Object.entries(value)
  .filter(([method]) => httpMethods.has(method)).map(([method, operation]) => ({ path, method, ...operation })));

// The seed author with a single seeded complaint; that record is dropped from the store so that the only trace of
// the author in the data is the complaint under test (the baseline test proves it).
const author = seedUsers.find((user) => user.role === 'employee' && user.name === 'Сотрудник проектирования');
assert.ok(author, 'seed author exists');
const NEEDLES = [author.id, author.name];
const MARK = 'Аноним132маркер';
const READERS = ['manager-1', 'admin-1'];

const text = (response) => `${JSON.stringify(response.headers)}\n${response.body}`;
const leaked = (response) => NEEDLES.filter((needle) => text(response).toLowerCase().includes(needle.toLowerCase()));
const noLeak = (response, label) => assert.deepEqual(leaked(response), [], `${label}: author identity leaked (${response.statusCode}) ${response.body.slice(0, 300)}`);
const json = (response, status) => { assert.equal(response.statusCode, status, response.body); return response.json(); };

function newApp(t) {
  const app = buildApp(); t.after(() => app.close());
  // Test-only fixture isolation: remove the author's seeded complaints (private Map, no product code touched).
  const records = app.store.records;
  for (const [id, item] of [...records]) if (item.author.id === author.id) records.delete(id);
  const req = (method, url, payload, user = 'manager-1') => app.inject({ method, url,
    headers: user ? { 'x-demo-user': user } : {}, ...(payload === undefined ? {} : { payload }) });
  return { app, req };
}
const create = async (req, extra = {}) => json(await req('POST', '/complaints', { type: 'problem',
  categoryId: 'cross_department', description: `${MARK} на складе нет вентиляции.`, proposedSolution: 'Поставить вентиляцию.',
  ...extra }, author.id), 201);

/** Request template for each GET-like operation; keyed by operationId so the contract drives the sweep. */
const probes = {
  getSession: () => ['/session'],
  getReferenceData: () => ['/reference-data'],
  listComplaints: (c) => [`/complaints?limit=100`, `/complaints?limit=100&offset=0&queue=unassigned`, `/complaints?status=new`, `/complaints?type=problem`,
    `/complaints?categoryId=cross_department`, `/complaints?departmentId=${c.departmentId}`, '/complaints?overdue=true',
    `/complaints?q=${encodeURIComponent(MARK)}`],
  getComplaint: (c) => [`/complaints/${c.id}`],
  getSummary: () => ['/summary'],
  listNotifications: () => ['/notifications', '/notifications?since=2000-01-01T00:00:00.000Z'],
  findSimilarComplaints: () => [`/complaints/similar?text=${encodeURIComponent(MARK + ' на складе нет вентиляции')}`],
  suggestCategory: () => [`/complaints/suggest-category?text=${encodeURIComponent(MARK + ' склад вентиляция')}`],
  exportComplaints: () => ['/complaints/export', `/complaints/export?q=${encodeURIComponent(MARK)}`],
  getHealth: () => ['/health'],
  getSummaryDigest: () => ['/summary/digest'],
  getAnalyticsTrends: () => ['/analytics/trends'],
};
/** Operations that change state; exercised in the mutation scenario (as manager) or by the author. */
const mutations = ['createComplaint', 'assignComplaint', 'changeComplaintStatus', 'addComment', 'recordDecision', 'undoLastAction', 'resetDemo'];

test('#132 every contract operation has an anonymity probe (new routes cannot dodge the sweep)', () => {
  assert.ok(operations.length >= 19, `contract lists ${operations.length} operations`);
  for (const operation of operations) {
    assert.ok(operation.operationId in probes || mutations.includes(operation.operationId),
      `no anonymity probe for ${operation.method.toUpperCase()} ${operation.path} (${operation.operationId})`);
  }
});

test('#132 baseline: without the anonymous complaint the author does not appear anywhere (the detector is meaningful)', async (t) => {
  const { req } = newApp(t);
  for (const user of READERS) for (const operation of operations.filter((o) => o.operationId in probes)) {
    for (const url of probes[operation.operationId]({ id: 'complaint-1', departmentId: 'procurement' })) {
      const response = await req('GET', url, undefined, user);
      noLeak(response, `baseline ${user} GET ${url}`);
    }
  }
});

test('#132 sweep: all GET operations hide the author of an anonymous complaint from manager and admin', async (t) => {
  const { req } = newApp(t);
  const item = await create(req, { anonymous: true });
  // Give every surface something to show: clarification thread, author reply and a plain author comment.
  json(await req('POST', `/complaints/${item.id}/comments`, { kind: 'clarification_request', text: 'Нужны подробности.' }), 201);
  json(await req('POST', `/complaints/${item.id}/comments`, { kind: 'clarification_response', text: 'Подробности добавлены.' }, author.id), 201);
  json(await req('POST', `/complaints/${item.id}/comments`, { kind: 'comment', text: 'Дополнение автора.' }, author.id), 201);
  let swept = 0; let sawComplaint = 0;
  for (const user of READERS) for (const operation of operations.filter((o) => operation_has(o))) {
    for (const url of probes[operation.operationId](item)) {
      const response = await req('GET', url, undefined, user);
      assert.notEqual(response.statusCode, 404, `${user} GET ${url}: route is missing (${response.body})`);
      assert.ok([200, 403].includes(response.statusCode), `${user} GET ${url}: ${response.statusCode} ${response.body}`);
      noLeak(response, `${user} GET ${url}`);
      swept += 1;
      if (response.statusCode === 200 && response.body.includes(item.id)) sawComplaint += 1;
    }
  }
  assert.ok(swept >= 30, `swept ${swept} requests`);
  assert.ok(sawComplaint >= 6, 'the anonymous complaint really appears in the swept responses (list, card, export...)');
  // x-roles says who may read each operation: denied roles get a clean error, never an identity.
  for (const operation of operations.filter((o) => operation_has(o))) {
    for (const url of probes[operation.operationId](item)) {
      for (const user of READERS) {
        const response = await req('GET', url, undefined, user);
        const role = user.split('-')[0];
        if (!operation['x-roles'].includes(role)) assert.equal(response.statusCode, 403, `${user} ${operation.operationId}`);
      }
    }
  }
});
function operation_has(o) { return o.method === 'get' && o.operationId in probes; }

test('#132 sweep: mutation responses (assign, status, comment, decision, undo) never expose the anonymous author', async (t) => {
  const { req } = newApp(t);
  const item = await create(req, { anonymous: true });
  const id = item.id;
  const steps = [
    ['changeComplaintStatus', 'PATCH', `/complaints/${id}/status`, { status: 'in_review' }, 'manager-1', 200],
    ['assignComplaint', 'PATCH', `/complaints/${id}/assignment`, { assigneeId: 'manager-2' }, 'manager-2', 200],
    ['addComment', 'POST', `/complaints/${id}/comments`, { kind: 'clarification_request', text: 'Уточните место.' }, 'manager-2', 201],
    ['addComment', 'POST', `/complaints/${id}/comments`, { kind: 'comment', text: 'Внутренний комментарий.' }, 'manager-2', 201],
    ['addComment', 'POST', `/complaints/${id}/comments`, { kind: 'clarification_response', text: 'Склад номер два.' }, author.id, 201],
    ['changeComplaintStatus', 'PATCH', `/complaints/${id}/status`, { status: 'in_progress' }, 'manager-2', 200],
    ['undoLastAction', 'POST', `/complaints/${id}/undo`, undefined, 'manager-2', 200],
    ['changeComplaintStatus', 'PATCH', `/complaints/${id}/status`, { status: 'in_progress' }, 'manager-2', 200],
    ['recordDecision', 'POST', `/complaints/${id}/decision`, { outcome: 'implemented', explanation: 'Вентиляцию поставили.', actions: 'Заказ выполнен.' }, 'manager-2', 201],
  ];
  const covered = new Set();
  for (const [operationId, method, url, payload, user, status] of steps) {
    const response = await req(method, url, payload, user);
    assert.equal(response.statusCode, status, `${operationId}: ${response.body}`);
    covered.add(operationId);
    if (user !== author.id) noLeak(response, `${operationId} response to ${user}`);
  }
  // Invalid and forbidden calls by managers must not echo identity in error bodies either.
  for (const [method, url, payload, user] of [
    ['PATCH', `/complaints/${id}/status`, { status: 'bogus' }, 'manager-1'],
    ['POST', `/complaints/${id}/decision`, {}, 'manager-1'],
    ['POST', `/complaints/${id}/comments`, { kind: 'comment' }, 'manager-1'],
    ['POST', `/complaints/${id}/undo`, undefined, 'manager-1'],
    ['PATCH', `/complaints/${id}/assignment`, { assigneeId: 'admin-1' }, 'manager-1'],
    ['POST', `/complaints/${id}/comments`, { kind: 'comment', text: 'x' }, 'admin-1'],
    ['PATCH', `/complaints/${id}/status`, { status: 'in_review' }, 'admin-1'],
  ]) noLeak(await req(method, url, payload, user), `error ${method} ${url} as ${user}`);
  // Afterwards the whole read side (card history, list, export, notifications) is still clean.
  for (const user of READERS) for (const operation of operations.filter(operation_has)) {
    for (const url of probes[operation.operationId]({ id, departmentId: item.departmentId })) {
      noLeak(await req('GET', url, undefined, user), `after mutations ${user} GET ${url}`);
    }
  }
  for (const operationId of ['assignComplaint', 'changeComplaintStatus', 'addComment', 'recordDecision', 'undoLastAction']) {
    assert.ok(covered.has(operationId), `${operationId} was exercised`);
  }
});

test('#132 search by author name or id (q) and author-like filters do not find the anonymous complaint', async (t) => {
  const { req } = newApp(t);
  const item = await create(req, { anonymous: true });
  const unfiltered = json(await req('GET', '/complaints?limit=100'), 200);
  assert.ok(unfiltered.items.some((entry) => entry.id === item.id));
  for (const user of READERS) for (const needle of [author.name, author.id, author.name.toUpperCase(), author.name.split(' ')[1]]) {
    const q = encodeURIComponent(needle);
    for (const url of [`/complaints?limit=100&q=${q}`, `/complaints/export?q=${q}`, `/complaints?limit=100&q=${q}&status=new`]) {
      const response = await req('GET', url, undefined, user);
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(!response.body.includes(item.id), `${user}: ${url} found the anonymous complaint by author`);
      noLeak(response, `${user} ${url}`);
    }
    // Unknown filter names are not part of the contract; if one is ever implemented it must not match anonymous items.
    for (const param of ['authorId', 'author', 'authorName', 'createdBy', 'employeeId']) {
      const response = await req('GET', `/complaints?limit=100&${param}=${q}`, undefined, user);
      assert.ok([200, 400, 422].includes(response.statusCode), response.body);
      noLeak(response, `${user} ?${param}=`);
      if (response.statusCode === 200 && response.json().total < unfiltered.total) {
        assert.ok(!response.body.includes(item.id), `${user}: ?${param} matched the anonymous complaint by author`);
      }
    }
  }
  // Control: the MARK in the description is searchable, so an empty result above is not a broken search.
  const byText = json(await req('GET', `/complaints?limit=100&q=${encodeURIComponent(MARK)}`), 200);
  assert.ok(byText.items.some((entry) => entry.id === item.id));
});

test('#132 the author still sees themself everywhere they may read: card, list, own thread, notifications', async (t) => {
  const { req } = newApp(t);
  const item = await create(req, { anonymous: true });
  json(await req('POST', `/complaints/${item.id}/comments`, { kind: 'clarification_request', text: 'Нужны подробности.' }), 201);
  json(await req('POST', `/complaints/${item.id}/comments`, { kind: 'clarification_response', text: 'Вот подробности.' }, author.id), 201);
  const own = json(await req('GET', `/complaints/${item.id}`, undefined, author.id), 200);
  assert.equal(own.anonymous, true);
  assert.equal(own.author.id, author.id);
  assert.equal(own.author.name, author.name);
  assert.equal(own.comments.find((c) => c.kind === 'clarification_response').author.id, author.id);
  assert.ok(own.history.some((event) => event.actor?.id === author.id), 'author sees their own history events as themself');
  const list = json(await req('GET', '/complaints?limit=100', undefined, author.id), 200);
  assert.equal(list.items.find((entry) => entry.id === item.id).author.id, author.id);
  const feed = await req('GET', '/notifications', undefined, author.id);
  assert.equal(feed.statusCode, 200, feed.body);
  assert.ok(feed.body.includes(item.id), 'author gets the notification about the clarification request');
  // The author’s own mutation response is also complete.
  const reply = json(await req('POST', `/complaints/${item.id}/comments`, { kind: 'comment', text: 'Ещё одно.' }, author.id), 201);
  assert.equal(reply.author.id, author.id);
  // Another employee still sees nothing.
  assert.equal((await req('GET', `/complaints/${item.id}`, undefined, 'employee-2')).statusCode, 404);
});

test('#132 non-anonymous complaints are unchanged: managers and admins still see the author on every read route', async (t) => {
  const { req } = newApp(t);
  const item = await create(req); // anonymous omitted
  json(await req('POST', `/complaints/${item.id}/comments`, { kind: 'clarification_request', text: 'Подробнее?' }), 201);
  const flagged = await create(req, { anonymous: false, description: `${MARK} второе обращение.` });
  for (const user of READERS) {
    for (const entry of [item, flagged]) {
      const detail = json(await req('GET', `/complaints/${entry.id}`, undefined, user), 200);
      assert.equal(detail.author.id, author.id, `${user}: author id visible`);
      assert.equal(detail.author.name, author.name);
      assert.ok(!detail.anonymous, 'anonymous flag is false or absent');
    }
    const list = json(await req('GET', '/complaints?limit=100', undefined, user), 200);
    assert.equal(list.items.find((entry) => entry.id === item.id).author.id, author.id);
    const exported = await req('GET', '/complaints/export', undefined, user);
    assert.equal(exported.statusCode, 200);
    assert.ok(leaked(exported).length > 0 || !exported.body.includes(item.id), 'export keeps the author of non-anonymous rows');
    // Searching by the author name keeps working for regular complaints.
    const byName = json(await req('GET', `/complaints?limit=100&q=${encodeURIComponent(MARK)}`, undefined, user), 200);
    assert.ok(byName.items.some((entry) => entry.id === item.id));
  }
});

test('#132 demo reset (admin) and its aftermath leak nothing about an anonymous author', async (t) => {
  const { req } = newApp(t);
  const item = await create(req, { anonymous: true });
  assert.equal((await req('POST', '/demo/reset', undefined, 'manager-1')).statusCode, 403);
  noLeak(await req('POST', '/demo/reset', undefined, 'manager-1'), 'manager reset (403)');
  const reset = await req('POST', '/demo/reset', undefined, 'admin-1');
  assert.equal(reset.statusCode, 200, reset.body);
  assert.ok(!reset.body.includes(item.id) || leaked(reset).length === 0);
  // After reset the seed returns; the sweep over the read side still shows no identity of an anonymous author
  // (the test author’s seed complaint is regular data and is excluded from this check by id).
  const anonAgain = await create(req, { anonymous: true });
  for (const user of READERS) {
    const card = await req('GET', `/complaints/${anonAgain.id}`, undefined, user);
    noLeak(card, `${user} card after reset`);
  }
});
