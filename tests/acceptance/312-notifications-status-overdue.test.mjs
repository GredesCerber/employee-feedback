// #312 B2 / аудит Г7: автор получает событие о смене статуса (взято на рассмотрение / в работу),
// руководитель — о просроченном обращении (своём или без ответственного). События выводятся из истории, как прочие.
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
const HOUR = 3600000;

const req = (app, method, url, payload, user = 'employee-1') => app.inject({ method, url,
  headers: { 'x-demo-user': user }, ...(payload === undefined ? {} : { payload }) });
async function feed(app, user) {
  const response = await req(app, 'GET', '/notifications', undefined, user);
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.ok(validate(body), JSON.stringify(validate.errors));
  return body.items;
}
async function create(app, categoryId = 'cross_department', user = 'employee-1') {
  const response = await req(app, 'POST', '/complaints', { type: 'problem', categoryId, description: 'Тест уведомлений.' }, user);
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
const setStatus = (app, id, status) => req(app, 'PATCH', `/complaints/${id}/status`, { status }, 'manager-1');
function shiftDue(app, id, hoursFromNow, patch = {}) {
  const item = app.store.get(id);
  item.dueAt = new Date(Date.now() + hoursFromNow * HOUR).toISOString();
  Object.assign(item, patch);
  app.store.save(item);
  return item;
}
const setup = t => { const app = buildApp(); t.after(() => app.close()); return app; };

test('#312 author is notified when a manager takes the complaint into review and into work', async t => {
  const app = setup(t);
  const item = await create(app);
  assert.equal((await setStatus(app, item.id, 'in_review')).statusCode, 200);
  assert.equal((await setStatus(app, item.id, 'in_progress')).statusCode, 200);
  const statusEvents = async () => (await feed(app, 'employee-1'))
    .filter(event => event.complaintId === item.id && event.kind === 'status_changed');
  const events = await statusEvents();
  assert.deepEqual(events.map(event => event.message).sort(),
    [`Обращение ${item.number} взято в работу.`, `Обращение ${item.number} принято на рассмотрение.`].sort());
  for (const event of events) {
    assert.equal(event.href, `/my/${item.id}`);
    assert.equal(event.complaintNumber, item.number);
  }
  assert.equal(new Set(events.map(event => event.id)).size, 2, 'one event per status change');
  assert.deepEqual((await statusEvents()).map(event => event.id), events.map(event => event.id), 'feed is stable');
  // after the decision the intermediate status news give way to the decision event
  assert.equal((await req(app, 'POST', `/complaints/${item.id}/decision`, { outcome: 'implemented', explanation: 'Сделано.' }, 'manager-1')).statusCode, 201);
  assert.deepEqual(await statusEvents(), []);
  assert.ok((await feed(app, 'employee-1')).some(event => event.complaintId === item.id && event.kind === 'decision_recorded'));
});

test('#312 clarification and decision transitions do not duplicate their own events as status changes', async t => {
  const app = setup(t);
  const item = await create(app);
  const path = `/complaints/${item.id}`;
  await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Уточните.' }, 'manager-1');
  await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Ответ.' });
  await req(app, 'POST', `${path}/decision`, { outcome: 'rejected', explanation: 'Не подходит.' }, 'manager-1');
  const kinds = (await feed(app, 'employee-1')).filter(event => event.complaintId === item.id).map(event => event.kind).sort();
  assert.deepEqual(kinds, ['clarification_requested', 'decision_recorded']);
});

test('#312 other employees and managers never get the author status event', async t => {
  const app = setup(t);
  const item = await create(app);
  await setStatus(app, item.id, 'in_progress');
  assert.ok((await feed(app, 'employee-2')).every(event => event.complaintId !== item.id));
  for (const manager of ['manager-1', 'manager-2']) {
    assert.ok((await feed(app, manager)).every(event => event.kind !== 'status_changed'), manager);
  }
});

test('#312 manager sees overdue open complaints that are own or unassigned, at the due time, without duplicates', async t => {
  const app = setup(t);
  const own = await create(app, 'cross_department');
  const unassigned = await create(app, 'no_rule_demo');
  const soon = await create(app, 'cross_department');
  const done = await create(app, 'cross_department');
  const foreign = await create(app, 'cross_department');
  const ownItem = shiftDue(app, own.id, -3);
  shiftDue(app, unassigned.id, -1);
  shiftDue(app, soon.id, 5);
  shiftDue(app, done.id, -2, { status: 'closed' });
  const other = app.store.users.find(user => user.id === 'manager-2');
  shiftDue(app, foreign.id, -4, { assignee: other, routing: { queue: 'assigned', reason: 'manual_assignment' } });

  const items = await feed(app, 'manager-1');
  const overdue = items.filter(event => event.kind === 'overdue').map(event => event.complaintId);
  assert.ok(overdue.includes(own.id) && overdue.includes(unassigned.id));
  assert.ok(!overdue.includes(soon.id) && !overdue.includes(done.id) && !overdue.includes(foreign.id));
  const event = items.find(candidate => candidate.kind === 'overdue' && candidate.complaintId === own.id);
  assert.equal(event.createdAt, new Date(Date.parse(ownItem.dueAt)).toISOString());
  assert.equal(event.href, `/queue/${own.id}`);
  assert.equal(event.message, `Срок рассмотрения обращения ${own.number} истёк.`);
  assert.ok(!items.some(candidate => candidate.kind === 'due_soon' && candidate.complaintId === own.id),
    'an overdue complaint is not "due soon" at the same time');
  assert.equal(new Set(items.map(candidate => candidate.id)).size, items.length, 'ids are unique');
  const manager2 = (await feed(app, 'manager-2')).filter(candidate => candidate.kind === 'overdue').map(candidate => candidate.complaintId);
  assert.ok(manager2.includes(foreign.id) && manager2.includes(unassigned.id) && !manager2.includes(own.id));
  assert.ok((await feed(app, 'employee-1')).every(candidate => candidate.kind !== 'overdue'), 'employees do not get overdue events');
});
