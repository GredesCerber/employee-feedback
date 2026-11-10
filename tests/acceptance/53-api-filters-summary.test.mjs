import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';
import { summarize } from '../../api/dist/analytics.js';
const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false }); requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8')), 'contract');
const summarySchema = ajv.compile({ $ref: 'contract#/components/schemas/Summary' });
const listSchema = ajv.compile({ $ref: 'contract#/components/schemas/ComplaintList' });
const req = (app, url, user = 'manager-1') => app.inject({ url, headers: { 'x-demo-user': user } });
function setup(t) { const app = buildApp(); t.after(() => app.close()); return app; }

test('#53 department/category/status/deadline filters combine with inclusive UTC bounds', async t => {
  const app = setup(t);
  for (const [query, numbers] of [
    ['departmentId=accounting', ['A-005', 'A-006', 'A-007', 'A-008']],
    ['categoryId=training', ['A-004', 'A-016']],
    ['status=new', ['A-001', 'A-007', 'A-011', 'A-016', 'A-020']],
    ['dueBefore=2026-11-08T09%3A03%3A00Z', ['A-001', 'A-002', 'A-003', 'A-004']],
    ['departmentId=procurement&categoryId=training&status=implemented&dueAfter=2026-11-08T09%3A03%3A00Z&dueBefore=2026-11-08T09%3A03%3A00Z', ['A-004']],
  ]) {
    const response = await req(app, `/complaints?${query}`);
    assert.equal(response.statusCode, 200, query);
    const body = response.json();
    assert.ok(listSchema(body), JSON.stringify(listSchema.errors));
    assert.deepEqual(body.items.map(item => item.number).sort(), numbers, query);
    assert.equal(body.total, numbers.length);
  }
});

test('#53 overdue is based on current time and excludes all terminal states', async t => {
  const app = setup(t);
  const terminal = new Set(['implemented', 'rejected', 'closed']);
  const all = (await req(app, '/complaints')).json().items;
  for (const item of all) assert.equal(item.overdue, !terminal.has(item.status) && Date.parse(item.dueAt) < Date.now());
  const overdue = (await req(app, '/complaints?overdue=true')).json();
  assert.ok(overdue.items.every(item => item.overdue));
  assert.equal(overdue.total, all.filter(item => item.overdue).length);
  const other = (await req(app, '/complaints?overdue=false')).json();
  assert.ok(other.items.every(item => !item.overdue));
  assert.equal(other.total + overdue.total, 20);
});

test('#53 authorization precedes filtering/totals, search is literal, and pagination stable', async t => {
  const app = setup(t);
  const hidden = (await req(app, '/complaints?departmentId=accounting', 'employee-1')).json();
  assert.deepEqual(hidden.items, []); assert.equal(hidden.total, 0);
  const full = (await req(app, '/complaints?type=problem')).json();
  assert.equal(full.total, 9);
  const page = (await req(app, '/complaints?type=problem&limit=2&offset=1')).json();
  assert.equal(page.total, 9); assert.deepEqual(page.items, full.items.slice(1, 3));
  assert.equal((await req(app, '/complaints?q=%D0%92%20%D0%97%D0%90%D0%AF%D0%92%D0%9A%D0%90%D0%A5')).json().items[0].number, 'A-001');
  assert.equal((await req(app, '/complaints?q=.*')).json().total, 0);
  assert.equal((await req(app, '/complaints?categoryId=unknown')).json().total, 0);
});

test('#53 invalid filters return 422 without changing data', async t => {
  const app = setup(t), before = app.store.list();
  for (const query of ['status=unknown', 'type=unknown', 'dueAfter=bad', 'dueAfter=2026-02-30T00:00:00Z',
    'dueAfter=2026-11-10T00:00:00Z&dueBefore=2026-11-01T00:00:00Z', 'overdue=1',
    'limit=0', 'limit=101', 'offset=-1', 'limit=1&limit=2', 'categoryId=x/y', 'unknown=1']) {
    const response = await req(app, `/complaints?${query}`);
    assert.equal(response.statusCode, 422, query);
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  }
  assert.deepEqual(app.store.list(), before);
});

test('#53 seed summary exposes exact type counts, terminal share, response mean and recurring categories', async t => {
  const app = setup(t);
  const response = await req(app, '/summary', 'admin-1');
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.ok(summarySchema(body), JSON.stringify(summarySchema.errors));
  assert.equal(body.total, 20);
  assert.deepEqual(body.byType, [{ type: 'problem', count: 9 }, { type: 'suggestion', count: 10 }, { type: 'praise', count: 1 }]);
  assert.equal(body.closedCount, 4); assert.equal(body.closedShare, 0.2);
  assert.equal(body.respondedCount, 15); assert.equal(body.averageFirstResponseHours, 1);
  assert.deepEqual(body.recurringTopics.map(({ categoryId, count }) => ({ categoryId, count })),
    [{ categoryId: 'environment', count: 2 }, { categoryId: 'training', count: 2 }]);
  for (const user of ['employee-1', 'manager-1']) assert.equal((await req(app, '/summary', user)).statusCode, 403);
});

test('#53 empty summary has zero totals and null mean without NaN or division by zero', () => {
  const summary = summarize([], [], new Date('2026-11-10T09:00:00Z'));
  assert.ok(summarySchema(summary), JSON.stringify(summarySchema.errors));
  assert.equal(summary.total, 0); assert.equal(summary.closedCount, 0); assert.equal(summary.closedShare, 0);
  assert.equal(summary.respondedCount, 0); assert.equal(summary.averageFirstResponseHours, null);
  assert.deepEqual(summary.byType.map(entry => entry.count), [0, 0, 0]);
  assert.deepEqual(summary.recurringTopics, []);
});
