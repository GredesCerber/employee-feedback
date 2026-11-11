import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

const request = (app, method, url, user, payload) => app.inject({
  method, url, headers: { 'x-demo-user': user },
  ...(payload === undefined ? {} : { payload }),
});

const base = { type: 'problem', categoryId: 'no_rule_demo', description: 'Нужно улучшить освещение склада.' };

test('UX-02: a valid location is stored and returned on reload', async t => {
  const app = buildApp();
  t.after(() => app.close());
  const created = await request(app, 'POST', '/complaints', 'employee-1', { ...base, location: { latitude: 43.25, longitude: 76.95 } });
  assert.equal(created.statusCode, 201, created.body);
  assert.deepEqual(created.json().location, { latitude: 43.25, longitude: 76.95 });
  const reloaded = await request(app, 'GET', `/complaints/${created.json().id}`, 'employee-1');
  assert.equal(reloaded.statusCode, 200, reloaded.body);
  assert.deepEqual(reloaded.json().location, { latitude: 43.25, longitude: 76.95 });
});

test('UX-02: a complaint without a location stays valid and has no location property', async t => {
  const app = buildApp();
  t.after(() => app.close());
  const created = await request(app, 'POST', '/complaints', 'employee-1', base);
  assert.equal(created.statusCode, 201, created.body);
  assert.equal('location' in created.json(), false);
});

test('UX-01: range boundaries are accepted', async t => {
  const app = buildApp();
  t.after(() => app.close());
  for (const location of [{ latitude: -90, longitude: -180 }, { latitude: 90, longitude: 180 }]) {
    const created = await request(app, 'POST', '/complaints', 'employee-1', { ...base, location });
    assert.equal(created.statusCode, 201, created.body);
    assert.deepEqual(created.json().location, location);
  }
});

test('UX-01/UX-02: invalid locations are rejected and no record is created', async t => {
  const app = buildApp();
  t.after(() => app.close());
  const before = (await request(app, 'GET', '/complaints', 'manager-1')).json().total;
  const invalid = [
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: 'x', longitude: 0 },
    { latitude: 0 },
    null,
    { latitude: 0, longitude: 0, accuracy: 5 },
  ];
  for (const location of invalid) {
    const response = await request(app, 'POST', '/complaints', 'employee-1', { ...base, location });
    assert.equal(response.statusCode, 422, `${JSON.stringify(location)}: ${response.body}`);
  }
  const after = (await request(app, 'GET', '/complaints', 'manager-1')).json().total;
  assert.equal(after, before);
});

test('UX-02: a private location is not revealed to another employee', async t => {
  const app = buildApp();
  t.after(() => app.close());
  const created = await request(app, 'POST', '/complaints', 'employee-1', { ...base, location: { latitude: 1, longitude: 2 } });
  const id = created.json().id;
  const foreign = await request(app, 'GET', `/complaints/${id}`, 'employee-2');
  assert.ok(!foreign.body.includes('"latitude"'), 'foreign reader must not get coordinates');
});
