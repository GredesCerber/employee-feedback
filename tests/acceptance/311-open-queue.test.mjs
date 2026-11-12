import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const openStatuses = ['new', 'in_review', 'in_progress', 'awaiting_clarification'];
const allStatuses = [...openStatuses, 'implemented', 'rejected', 'closed'];
const read = (app, url, user = 'manager-1') => app.inject({ url, headers: { 'x-demo-user': user } });

test('#311 contract declares status_group=open for list and CSV', () => {
  for (const path of ['/complaints', '/complaints/export']) {
    const parameter = contract.paths[path].get.parameters.find(p => p.name === 'status_group' && p.in === 'query');
    assert.ok(parameter, path);
    assert.deepEqual(parameter.schema.enum, ['open']);
  }
});

test('#311 filters all four open statuses before pagination, preserving role visibility and dashboard total', async t => {
  const app = buildApp(); t.after(() => app.close()); await app.ready();
  const records = app.store.list();
  records.forEach((record, index) => { record.status = allStatuses[index % allStatuses.length]; app.store.save(record); });
  const expected = records.filter(record => openStatuses.includes(record.status));
  const baseline = await read(app, '/complaints?limit=100');
  assert.equal(baseline.statusCode, 200); assert.equal(baseline.json().total, records.length);
  for (const user of ['manager-1', 'admin-1']) {
    const response = await read(app, '/complaints?status_group=open&limit=3&offset=2', user);
    assert.equal(response.statusCode, 200); assert.equal(response.json().total, expected.length);
    assert.equal(response.json().items.length, 3);
    assert.ok(response.json().items.every(item => openStatuses.includes(item.status)));
    const full = await read(app, '/complaints?status_group=open&limit=100', user);
    assert.deepEqual(new Set(full.json().items.map(item => item.id)), new Set(expected.map(item => item.id)));
  }
  const employee = await read(app, '/complaints?status_group=open&limit=100', 'employee-1');
  assert.equal(employee.statusCode, 200);
  const employeeExpected = expected.filter(item => item.author.id === 'employee-1');
  assert.equal(employee.json().total, employeeExpected.length);
  assert.deepEqual(new Set(employee.json().items.map(item => item.id)), new Set(employeeExpected.map(item => item.id)));
  const trends = await read(app, '/analytics/trends');
  assert.equal(trends.statusCode, 200);
  assert.equal(trends.json().totals.openCount, expected.length);
  for (const path of ['/complaints', '/complaints/export']) {
    assert.equal((await read(app, path + '?status_group=closed')).statusCode, 422);
  }
});

test('#311 combines open with department, category, status, search and overdue; CSV contains the same set', async t => {
  const app = buildApp(); t.after(() => app.close()); await app.ready();
  const records = app.store.list();
  records.forEach((record, index) => { record.status = allStatuses[index % allStatuses.length]; app.store.save(record); });
  const chosen = records.find(record => openStatuses.includes(record.status));
  const query = new URLSearchParams({ status_group: 'open', departmentId: chosen.departmentId, categoryId: chosen.categoryId,
    status: chosen.status, q: chosen.number });
  const result = await read(app, '/complaints?' + query);
  assert.equal(result.statusCode, 200); assert.equal(result.json().total, 1);
  assert.equal(result.json().items[0].id, chosen.id);
  const impossible = await read(app, '/complaints?status_group=open&status=closed');
  assert.equal(impossible.statusCode, 200); assert.equal(impossible.json().total, 0);
  const overdue = await read(app, '/complaints?status_group=open&overdue=true&limit=100');
  assert.equal(overdue.statusCode, 200);
  assert.ok(overdue.json().items.every(item => item.overdue && openStatuses.includes(item.status)));
  const csv = await read(app, '/complaints/export?' + query);
  assert.equal(csv.statusCode, 200);
  for (const record of records) assert.equal(csv.body.includes(record.number), record.id === chosen.id, record.number);
});
