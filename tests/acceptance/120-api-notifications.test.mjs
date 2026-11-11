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
const validate = ajv.compile({ $ref: 'contract#/components/schemas/NotificationList' });
const DISCLAIMER = 'Имитация: в промышленной версии email / Битрикс24';
const HOUR = 3600000;

const req = (app, method, url, payload, user = 'employee-1') => app.inject({ method, url,
  headers: { 'x-demo-user': user }, ...(payload === undefined ? {} : { payload }) });
async function feed(app, user, query = '') {
  const response = await req(app, 'GET', `/notifications${query}`, undefined, user);
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.ok(validate(body), JSON.stringify(validate.errors));
  return body;
}
async function create(app, categoryId = 'cross_department', user = 'employee-1') {
  const response = await req(app, 'POST', '/complaints', { type: 'problem', categoryId, description: 'Тест ленты событий.' }, user);
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
function shiftDue(app, id, hoursFromNow, patch = {}) {
  const item = app.store.get(id);
  item.dueAt = new Date(Date.now() + hoursFromNow * HOUR).toISOString();
  Object.assign(item, patch);
  app.store.save(item);
  return item;
}
const setup = t => { const app = buildApp(); t.after(() => app.close()); return app; };

test('#120 author sees clarification request and decision with the complaint number and link', async t => {
  const app = setup(t);
  const item = await create(app);
  const path = `/complaints/${item.id}`;
  assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Уточните детали.' }, 'manager-1')).statusCode, 201);
  let events = (await feed(app, 'employee-1')).items.filter(event => event.complaintId === item.id);
  assert.deepEqual(events.map(event => event.kind), ['clarification_requested']);
  assert.equal(events[0].complaintNumber, item.number);
  assert.equal(events[0].href, `/my/${item.id}`);
  assert.equal((await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Детали.' })).statusCode, 201);
  assert.equal((await req(app, 'POST', `${path}/decision`, { outcome: 'rejected', explanation: 'Не подходит.' }, 'manager-1')).statusCode, 201);
  events = (await feed(app, 'employee-1')).items.filter(event => event.complaintId === item.id);
  assert.deepEqual(events.map(event => event.kind).sort(), ['clarification_requested', 'decision_recorded']);
  for (const event of events) {
    assert.equal(event.complaintNumber, item.number);
    assert.equal(event.href, `/my/${item.id}`);
    assert.ok(event.message.includes(item.number) || event.message.trim());
  }
  // seeded history is in the feed too (A-004 decision of employee-1)
  const all = (await feed(app, 'employee-1')).items;
  assert.ok(all.some(event => event.kind === 'decision_recorded' && event.complaintNumber === 'A-004'));
});

test('#120 an employee never receives events about other people complaints or manager-only kinds', async t => {
  const app = setup(t);
  const item = await create(app, 'cross_department', 'employee-1');
  await req(app, 'POST', `/complaints/${item.id}/comments`, { kind: 'clarification_request', text: 'Уточните.' }, 'manager-1');
  const other = await feed(app, 'employee-2');
  assert.ok(other.items.every(event => event.complaintId !== item.id));
  const mine = (await feed(app, 'employee-1')).items;
  for (const event of [...mine, ...other.items]) {
    assert.ok(['clarification_requested', 'decision_recorded'].includes(event.kind), event.kind);
    assert.match(event.href, /^\/my\//);
  }
  const owners = new Map(app.store.list().map(complaint => [complaint.id, complaint.author.id]));
  assert.ok(other.items.every(event => owners.get(event.complaintId) === 'employee-2'));
  assert.ok(mine.every(event => owners.get(event.complaintId) === 'employee-1'));
});

test('#120 manager gets unassigned complaints and author clarification responses for own complaints only', async t => {
  const app = setup(t);
  const unassigned = await create(app, 'no_rule_demo');
  const assigned = await create(app, 'cross_department');
  assert.equal(assigned.assignee.id, 'manager-1');
  for (const manager of ['manager-1', 'manager-2']) {
    const events = (await feed(app, manager)).items;
    const event = events.find(candidate => candidate.complaintId === unassigned.id);
    assert.equal(event?.kind, 'unassigned', manager);
    assert.equal(event.complaintNumber, unassigned.number);
    assert.equal(event.href, `/queue/${unassigned.id}`);
  }
  await req(app, 'POST', `/complaints/${assigned.id}/comments`, { kind: 'clarification_request', text: 'Уточните.' }, 'manager-1');
  await req(app, 'POST', `/complaints/${assigned.id}/comments`, { kind: 'clarification_response', text: 'Ответ автора.' }, 'employee-1');
  const own = (await feed(app, 'manager-1')).items.filter(event => event.complaintId === assigned.id);
  assert.deepEqual(own.map(event => event.kind), ['clarification_received']);
  assert.equal(own[0].href, `/queue/${assigned.id}`);
  const foreign = (await feed(app, 'manager-2')).items;
  assert.ok(foreign.every(event => event.complaintId !== assigned.id), 'another manager does not see an assigned complaint');
  // an assigned complaint never produces "unassigned"
  assert.ok((await feed(app, 'manager-1')).items.every(event => !(event.kind === 'unassigned' && event.complaintId === assigned.id)));
});

test('#120 due-soon events cover 0..24h for own or unassigned open complaints, stable and without duplicates', async t => {
  const app = setup(t);
  const soon = await create(app, 'cross_department');
  const late = await create(app, 'cross_department');
  const past = await create(app, 'cross_department');
  const done = await create(app, 'cross_department');
  const unassigned = await create(app, 'no_rule_demo');
  const foreign = await create(app, 'cross_department');
  const soonItem = shiftDue(app, soon.id, 12);
  shiftDue(app, late.id, 30); shiftDue(app, past.id, -2);
  shiftDue(app, done.id, 5, { status: 'closed' });
  shiftDue(app, unassigned.id, 3);
  const other = app.store.users.find(user => user.id === 'manager-2');
  shiftDue(app, foreign.id, 5, { assignee: other, routing: { queue: 'assigned', reason: 'manual_assignment' } });

  const first = await feed(app, 'manager-1');
  const second = await feed(app, 'manager-1');
  const dueSoon = first.items.filter(event => event.kind === 'due_soon');
  assert.deepEqual(dueSoon.map(event => event.complaintId).sort(), [soon.id, unassigned.id].sort());
  const event = dueSoon.find(candidate => candidate.complaintId === soon.id);
  assert.equal(event.createdAt, new Date(Date.parse(soonItem.dueAt) - 24 * HOUR).toISOString());
  assert.equal(event.href, `/queue/${soon.id}`);
  assert.deepEqual(second.items.filter(candidate => candidate.kind === 'due_soon').map(candidate => candidate.id),
    dueSoon.map(candidate => candidate.id));
  assert.equal(new Set(first.items.map(candidate => candidate.id)).size, first.items.length, 'ids are unique');
  const manager2 = (await feed(app, 'manager-2')).items.filter(candidate => candidate.kind === 'due_soon').map(candidate => candidate.complaintId);
  assert.ok(manager2.includes(foreign.id) && manager2.includes(unassigned.id));
  assert.ok(!manager2.includes(soon.id));
  // employees never get due-soon events
  assert.ok((await feed(app, 'employee-1')).items.every(candidate => candidate.kind !== 'due_soon'));
});

test('#120 since is an exclusive lower bound, unreadCount counts returned events, order is stable', async t => {
  const app = setup(t);
  const item = await create(app);
  const path = `/complaints/${item.id}`;
  await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Уточните.' }, 'manager-1');
  const all = await feed(app, 'employee-1');
  assert.ok(all.items.length >= 2);
  assert.equal(all.unreadCount, all.items.length);
  const sorted = [...all.items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : 1));
  assert.deepEqual(all.items.map(event => event.id), sorted.map(event => event.id));
  const newest = all.items[0];
  const afterNewest = await feed(app, 'employee-1', `?since=${encodeURIComponent(newest.createdAt)}`);
  assert.equal(afterNewest.items.length, 0, 'event exactly at since is excluded');
  assert.equal(afterNewest.unreadCount, 0);
  const before = await feed(app, 'employee-1', `?since=${encodeURIComponent(new Date(Date.parse(newest.createdAt) - 1).toISOString())}`);
  assert.ok(before.items.some(event => event.id === newest.id));
  assert.equal(before.unreadCount, before.items.length);
  await new Promise(resolve => setTimeout(resolve, 5));
  await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Ответ.' });
  await req(app, 'PATCH', `${path}/status`, { status: 'in_progress' }, 'manager-1');
  await req(app, 'POST', `${path}/decision`, { outcome: 'closed', explanation: 'Решено.' }, 'manager-1');
  const fresh = await feed(app, 'employee-1', `?since=${encodeURIComponent(newest.createdAt)}`);
  assert.deepEqual(fresh.items.map(event => event.kind), ['decision_recorded']);
  assert.equal(fresh.unreadCount, 1);
  const future = await feed(app, 'employee-1', `?since=${encodeURIComponent('2999-01-01T00:00:00Z')}`);
  assert.deepEqual(future.items, []);
  assert.equal(future.unreadCount, 0);
});

test('#120 invalid or repeated query is 422, roles and authentication are enforced', async t => {
  const app = setup(t);
  for (const query of ['?since=вчера', '?since=', '?since=2026-13-45T00:00:00Z', '?unknown=1',
    '?since=2026-01-01T00:00:00Z&since=2026-01-02T00:00:00Z']) {
    const response = await req(app, 'GET', `/notifications${query}`);
    assert.equal(response.statusCode, 422, query);
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  }
  assert.equal((await req(app, 'GET', '/notifications', undefined, 'admin-1')).statusCode, 403);
  assert.equal((await req(app, 'GET', '/notifications', undefined, 'nobody')).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/notifications' })).statusCode, 401);
});

test('#120 every event is simulated with the disclaimer and the feed has no read-state endpoint', async t => {
  const app = setup(t);
  await create(app, 'no_rule_demo');
  for (const user of ['employee-1', 'employee-2', 'manager-1']) {
    const body = await feed(app, user);
    assert.ok(body.items.length > 0, user);
    for (const event of body.items) {
      assert.equal(event.simulated, true);
      assert.equal(event.disclaimer, DISCLAIMER);
    }
  }
  const before = app.store.list();
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const response = await req(app, method, '/notifications', method === 'DELETE' ? undefined : {});
    assert.ok([404, 405].includes(response.statusCode), `${method}: ${response.statusCode}`);
  }
  await feed(app, 'manager-1');
  assert.deepEqual(app.store.list(), before, 'reading the feed does not change stored data');
});

test('#120 feed text, ids and links never expose author identity', async t => {
  const app = setup(t);
  await create(app, 'no_rule_demo');
  const item = await create(app, 'cross_department');
  await req(app, 'POST', `/complaints/${item.id}/comments`, { kind: 'clarification_request', text: 'Уточните.' }, 'manager-1');
  await req(app, 'POST', `/complaints/${item.id}/comments`, { kind: 'clarification_response', text: 'Ответ.' }, 'employee-1');
  shiftDue(app, item.id, 6);
  const users = app.store.users.filter(user => user.role === 'employee');
  for (const viewer of ['manager-1', 'manager-2']) {
    const json = JSON.stringify(await feed(app, viewer));
    for (const user of users) {
      assert.ok(!json.includes(user.name), `${viewer} feed contains ${user.name}`);
      assert.ok(!json.includes(user.id), `${viewer} feed contains ${user.id}`);
    }
    assert.ok(!/https?:\/\//.test(json), 'links are relative');
  }
});
