import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const read = (app, url, user = 'manager-1') => app.inject({ url, headers: { 'x-demo-user': user } });

test('#289 contract declares assignee=me for list and export', () => {
  for (const path of ['/complaints', '/complaints/export']) {
    const parameter = contract.paths[path].get.parameters.find(p => p.name === 'assignee' && p.in === 'query');
    assert.ok(parameter, path);
    assert.deepEqual(parameter.schema.enum, ['me']);
    assert.match(parameter.description, /manager|руководител/i);
  }
});

test('#289 manager identity filters before total, offset and limit, combined with other filters and CSV', async t => {
  const app = buildApp(); t.after(() => app.close()); await app.ready();
  const managers = app.store.users.filter(user => user.role === 'manager');
  const records = app.store.list();
  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    item.assignee = i < 4 ? managers.find(user => user.id === 'manager-1') : i < 8 ? managers.find(user => user.id === 'manager-2') : null;
    item.status = i % 2 === 0 ? 'new' : 'in_review';
    item.routing = { ...item.routing, queue: item.assignee ? 'assigned' : 'unassigned' };
    app.store.save(item);
  }
  const all = await read(app, '/complaints?limit=100');
  assert.equal(all.statusCode, 200); assert.equal(all.json().total, records.length);
  const mine = await read(app, '/complaints?assignee=me&limit=2&offset=1');
  assert.equal(mine.statusCode, 200); assert.equal(mine.json().total, 4);
  assert.equal(mine.json().items.length, 2);
  assert.ok(mine.json().items.every(item => item.assignee?.id === 'manager-1'));
  const other = await read(app, '/complaints?assignee=me&limit=100', 'manager-2');
  assert.equal(other.statusCode, 200); assert.equal(other.json().total, 4);
  assert.ok(other.json().items.every(item => item.assignee?.id === 'manager-2'));
  const filtered = await read(app, '/complaints?assignee=me&status=new&queue=assigned&limit=100');
  assert.equal(filtered.statusCode, 200); assert.equal(filtered.json().total, 2);
  assert.ok(filtered.json().items.every(item => item.assignee?.id === 'manager-1' && item.status === 'new'));
  const none = await read(app, '/complaints?assignee=me&queue=unassigned');
  assert.equal(none.json().total, 0);
  const csv = await read(app, '/complaints/export?assignee=me&status=new&queue=assigned');
  assert.equal(csv.statusCode, 200);
  for (const item of records) {
    assert.equal(csv.body.includes(item.number), filtered.json().items.some(match => match.id === item.id), item.number);
  }
});

test('#289 rejects unauthorized roles and unknown values on list and export', async t => {
  const app = buildApp(); t.after(() => app.close());
  for (const path of ['/complaints', '/complaints/export']) {
    for (const user of ['employee-1', 'admin-1']) assert.equal((await read(app, path + '?assignee=me', user)).statusCode, 403, path + user);
    assert.equal((await read(app, path + '?assignee=someone', 'manager-1')).statusCode, 422, path);
  }
});
