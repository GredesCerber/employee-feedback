import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

function setup(t, origins, overrides = {}) {
  const values = { CORS_ORIGINS: origins, NODE_ENV: 'test', RATE_LIMIT_MAX: '0', ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const app = buildApp(); t.after(() => app.close()); return app;
}
const read = (app, origin) => app.inject({ url: '/complaints', headers: { 'x-demo-user': 'employee-1', ...(origin ? { origin } : {}) } });

test('#94 security headers protect successful responses and errors', async t => {
  const app = setup(t);
  for (const response of [await read(app), await app.inject('/health'), await app.inject('/missing'), await app.inject('/complaints')]) {
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('#94 only configured origins receive CORS without restricting server access', async t => {
  const app = setup(t, 'http://a.test, http://b.test');
  for (const origin of ['http://a.test', 'http://b.test']) {
    const response = await read(app, origin);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.ok(response.headers.vary.toLowerCase().split(/\s*,\s*/).includes('origin'));
  }
  for (const origin of ['http://foreign.test', 'http://a.test.evil.test', undefined]) {
    const response = await read(app, origin);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
});

test('#94 allowed preflight accepts browser methods and demo role headers', async t => {
  const app = setup(t, 'http://a.test');
  const response = await app.inject({ method: 'OPTIONS', url: '/complaints/complaint-1/status', headers: {
    origin: 'http://a.test', 'access-control-request-method': 'PATCH',
    'access-control-request-headers': 'content-type,x-demo-user,x-request-id',
  } });
  assert.equal(response.statusCode, 204);
  assert.equal(response.body, '');
  assert.equal(response.headers['access-control-allow-origin'], 'http://a.test');
  const methods = response.headers['access-control-allow-methods'].split(/\s*,\s*/);
  for (const method of ['GET', 'POST', 'PATCH', 'OPTIONS']) assert.ok(methods.includes(method));
  const headers = response.headers['access-control-allow-headers'].toLowerCase().split(/\s*,\s*/);
  for (const header of ['content-type', 'x-demo-user', 'x-request-id']) assert.ok(headers.includes(header));
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('#94 missing configuration disables CORS including preflight', async t => {
  const app = setup(t);
  const response = await read(app, 'http://a.test');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  const options = await app.inject({ method: 'OPTIONS', url: '/complaints', headers: { origin: 'http://a.test', 'access-control-request-method': 'POST' } });
  assert.equal(options.headers['access-control-allow-origin'], undefined);
  assert.equal(options.headers['access-control-allow-methods'], undefined);
});

test('#94 allowed origins receive CORS and security headers on rate-limit errors', async t => {
  const app = setup(t, 'http://a.test', { NODE_ENV: 'development', RATE_LIMIT_MAX: '1' });
  const request = { method: 'POST', url: '/complaints', headers: { origin: 'http://a.test', 'x-demo-user': 'employee-1' }, payload: { type: 'problem', categoryId: 'cross_department', description: 'Проверка CORS.' } };
  assert.equal((await app.inject(request)).statusCode, 201);
  const response = await app.inject(request);
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['access-control-allow-origin'], 'http://a.test');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.ok(response.headers['access-control-expose-headers'].toLowerCase().includes('retry-after'));
});
