import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const addFormats = requireApi('ajv-formats').default;
const spec = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false });
addFormats(ajv);
ajv.addSchema(spec, 'contract');
const complaintSchema = ajv.compile({ $ref: 'contract#/components/schemas/Complaint' });
const payload = { type: 'problem', categoryId: 'cross_department', description: 'Нужна ясная заявка.' };
const request = (app, method, url, body, user = 'employee-1') => app.inject({ method, url,
  headers: user ? { 'x-demo-user': user } : {}, ...(body === undefined ? {} : { payload: body }) });
function setup(t) { const app = buildApp(); t.after(() => app.close()); return app; }

test('#51 creation returns contract-valid 201 with number, new status and configured owner', async (t) => {
  const app = setup(t);
  const response = await request(app, 'POST', '/complaints', payload);
  assert.equal(response.statusCode, 201);
  const item = response.json();
  assert.ok(complaintSchema(item), JSON.stringify(complaintSchema.errors));
  assert.equal(item.number, 'A-021');
  assert.equal(item.status, 'new');
  assert.equal(item.priority, 'medium');
  assert.equal(item.author.id, 'employee-1');
  assert.equal(item.departmentId, 'procurement');
  const references = (await request(app, 'GET', '/reference-data', undefined, 'manager-1')).json();
  assert.equal(item.assignee.id, references.categories.find(c => c.id === payload.categoryId).assigneeId);
  assert.deepEqual(item.routing, { queue: 'assigned', reason: 'category_rule' });
  assert.equal(Date.parse(item.dueAt) - Date.parse(item.createdAt), 7 * 86400000);
  assert.deepEqual(item.history.map(h => h.kind), ['created', 'assigned']);
  assert.equal(item.firstResponseAt, null);
  assert.deepEqual((await request(app, 'GET', `/complaints/${item.id}`)).json(), item);
});

test('#51 missing routing rule registers in manager-visible unassigned queue', async (t) => {
  const app = setup(t);
  const response = await request(app, 'POST', '/complaints', { ...payload, categoryId: 'no_rule_demo' });
  assert.equal(response.statusCode, 201);
  const item = response.json();
  assert.ok(complaintSchema(item), JSON.stringify(complaintSchema.errors));
  assert.equal(item.assignee, null);
  assert.deepEqual(item.routing, { queue: 'unassigned', reason: 'no_rule' });
  const queue = await request(app, 'GET', '/complaints?queue=unassigned', undefined, 'manager-1');
  assert.equal(queue.statusCode, 200);
  assert.ok(queue.json().items.some(c => c.id === item.id));
  const assigned = await request(app, 'PATCH', `/complaints/${item.id}/assignment`, { assigneeId: 'manager-1' }, 'manager-1');
  assert.equal(assigned.statusCode, 200);
  assert.equal(assigned.json().routing.reason, 'manual_assignment');
  assert.equal(assigned.json().firstResponseAt, null);
  assert.equal(assigned.json().dueAt, item.dueAt);
  assert.equal((await request(app, 'GET', '/complaints?queue=unassigned', undefined, 'manager-1')).json().total, 0);
});

test('#51 invalid input and forbidden creation leave the store unchanged', async (t) => {
  const app = setup(t);
  const before = app.store.list();
  for (const invalid of [{ ...payload, description: '   ' }, { ...payload, categoryId: 'missing' },
    { ...payload, author: { id: 'employee-2' } }, { ...payload, priority: 'urgent' },
    { ...payload, attachments: [{ name: 'x', mediaType: 'text/plain', sizeBytes: 1, isPlaceholder: false }] }, null]) {
    const response = await request(app, 'POST', '/complaints', invalid);
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  }
  for (const user of ['manager-1', 'admin-1']) assert.equal((await request(app, 'POST', '/complaints', payload, user)).statusCode, 403);
  for (const user of [null, 'unknown']) assert.equal((await request(app, 'POST', '/complaints', payload, user)).statusCode, 401);
  assert.deepEqual(app.store.list(), before);
});

test('#51 access checks hide other employees records and constrain reference data', async (t) => {
  const app = setup(t);
  const own = (await request(app, 'POST', '/complaints', payload)).json();
  const hidden = await request(app, 'GET', `/complaints/${own.id}`, undefined, 'employee-2');
  const missing = await request(app, 'GET', '/complaints/missing', undefined, 'employee-2');
  assert.equal(hidden.statusCode, 404);
  assert.deepEqual(hidden.json(), missing.json());
  const list = (await request(app, 'GET', '/complaints', undefined, 'employee-2')).json();
  assert.ok(list.items.every(item => item.author.id === 'employee-2'));
  assert.deepEqual((await request(app, 'GET', '/reference-data')).json().assignees, []);
  assert.equal((await request(app, 'GET', '/session')).json().role, 'employee');
  assert.equal((await request(app, 'GET', '/complaints?queue=assigned&queue=unassigned')).statusCode, 422);
});

test('#51 concurrent registrations allocate unique IDs and preserve all records', async (t) => {
  const app = setup(t);
  const responses = await Promise.all(Array.from({ length: 12 }, () => request(app, 'POST', '/complaints', payload)));
  assert.ok(responses.every(response => response.statusCode === 201));
  assert.equal(new Set(responses.map(response => response.json().number)).size, 12);
  assert.equal(new Set(responses.map(response => response.json().id)).size, 12);
  assert.equal(app.store.list().length, 32);
});
