import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const payload = { type: 'problem', categoryId: 'cross_department', description: 'Проверка ограничения.' };
function setup(t, overrides = {}) {
  const values = { NODE_ENV: 'development', RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_S: '60', ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const app = buildApp(); t.after(() => app.close()); return app;
}
const write = (app, user = 'employee-1') => app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': user }, payload });

test('#90 excess writes return 429, RATE_LIMITED and Retry-After without mutation', async t => {
  const app = setup(t);
  const first = await write(app);
  assert.equal(first.statusCode, 201);
  assert.equal(first.headers['x-ratelimit-limit'], '2');
  assert.equal(first.headers['x-ratelimit-remaining'], '1');
  assert.equal((await write(app)).statusCode, 201);
  const before = app.store.list();
  const blocked = await write(app);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().code, 'RATE_LIMITED');
  assert.ok(Number(blocked.headers['retry-after']) > 0 && Number(blocked.headers['retry-after']) <= 60);
  assert.equal(blocked.headers['x-ratelimit-remaining'], '0');
  assert.deepEqual(app.store.list(), before);
  assert.equal((await write(app, 'employee-2')).statusCode, 201);
});

test('#90 exhausted write quota does not limit GET requests', async t => {
  const app = setup(t, { RATE_LIMIT_MAX: '1' });
  await write(app);
  for (let i = 0; i < 10; i++) assert.equal((await app.inject({ url: '/complaints', headers: { 'x-demo-user': 'employee-1' } })).statusCode, 200);
});

test('#90 window expiry accepts writes again using fake time, no sleep', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T12:00:00Z') });
  const app = setup(t, { RATE_LIMIT_MAX: '1' });
  assert.equal((await write(app)).statusCode, 201);
  t.mock.timers.tick(1000);
  const blocked = await write(app);
  assert.equal(blocked.statusCode, 429); assert.equal(blocked.headers['retry-after'], '59');
  t.mock.timers.tick(59000);
  assert.equal((await write(app)).statusCode, 201);
});

test('#90 PATCH and invalid writes share the user quota and expose quota headers', async t => {
  const app = setup(t, { RATE_LIMIT_MAX: '1' });
  const first = await app.inject({ method: 'PATCH', url: '/complaints/complaint-1/status', headers: { 'x-demo-user': 'manager-1' }, payload: { status: 'unknown' } });
  assert.equal(first.statusCode, 422);
  assert.equal(first.headers['x-ratelimit-limit'], '1');
  assert.equal(first.headers['x-ratelimit-remaining'], '0');
  const next = await app.inject({ method: 'PATCH', url: '/complaints/complaint-1/status', headers: { 'x-demo-user': 'manager-1' }, payload: { status: 'in_review' } });
  assert.equal(next.statusCode, 429);
});

test('#90 NODE_ENV=test and RATE_LIMIT_MAX=0 disable the limiter', async t => {
  for (const config of [{ NODE_ENV: 'test', RATE_LIMIT_MAX: '1' }, { RATE_LIMIT_MAX: '0' }]) {
    const app = setup(t, config);
    for (let i = 0; i < 4; i++) assert.equal((await write(app)).statusCode, 201);
  }
});

test('#90 default quota is 30 writes per 60 seconds', async t => {
  const app = setup(t, { RATE_LIMIT_MAX: undefined, RATE_LIMIT_WINDOW_S: undefined });
  assert.equal((await write(app)).headers['x-ratelimit-limit'], '30');
});
