import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';
const post = (app, payload) => app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' }, payload: { type: 'problem', categoryId: 'no_rule_demo', description: 'Освещение', ...payload } });
test('optional coordinates persist; invalid points cause no writes', async t => {
  const app = buildApp(); t.after(() => app.close());
  const omitted = await post(app, {}); assert.equal(omitted.statusCode, 201, omitted.body); assert.equal('location' in omitted.json(), false);
  const location = { latitude: -90, longitude: 180 }; const created = await post(app, { location }); assert.equal(created.statusCode, 201, created.body); assert.deepEqual(created.json().location, location);
  const read = await app.inject({ method: 'GET', url: `/complaints/${created.json().id}`, headers: { 'x-demo-user': 'employee-1' } }); assert.deepEqual(read.json().location, location);
  const count = app.store.list().length;
  for (const invalid of [null, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: 0 }, { latitude: 0, longitude: 0, extra: true }]) { const response = await post(app, { location: invalid }); assert.equal(response.statusCode, 422, response.body); assert.equal(app.store.list().length, count); }
});
