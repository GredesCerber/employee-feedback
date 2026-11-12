import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { buildApp } from '../../api/dist/app.js';

const user = { 'x-demo-user': 'employee-1' };

test('#93 каждый ответ несёт X-Request-Id: пришедший от клиента или сгенерированный', async t => {
  const app = buildApp(); t.after(() => app.close());
  const given = await app.inject({ url: '/health', headers: { 'x-request-id': 'req-abc.123' } });
  assert.equal(given.headers['x-request-id'], 'req-abc.123');
  const generated = await app.inject({ url: '/health' });
  assert.ok(generated.headers['x-request-id']);
  const another = await app.inject({ url: '/health' });
  assert.notEqual(another.headers['x-request-id'], generated.headers['x-request-id']);
  const unsafe = await app.inject({ url: '/health', headers: { 'x-request-id': 'a b\tc' } });
  assert.notEqual(unsafe.headers['x-request-id'], 'a b\tc');
  const tooLong = await app.inject({ url: '/health', headers: { 'x-request-id': 'x'.repeat(101) } });
  assert.notEqual(tooLong.headers['x-request-id'], 'x'.repeat(101));
});

test('#93 тело ошибки содержит тот же requestId, что и заголовок', async t => {
  const app = buildApp(); t.after(() => app.close());
  for (const [method, url, headers, payload] of [
    ['GET', '/session', {}, undefined],
    ['GET', '/complaints/missing', user, undefined],
    ['POST', '/complaints', { ...user, 'content-type': 'application/json' }, '{bad json'],
    ['POST', '/complaints', { ...user, 'content-type': 'application/json' }, JSON.stringify({})],
    ['POST', '/complaints', { ...user, 'content-type': 'text/plain' }, 'x'],
  ]) {
    const response = await app.inject({ method, url, headers: { 'x-request-id': 'trace-1', ...headers }, payload });
    assert.ok(response.statusCode >= 400, `${method} ${url}`);
    assert.equal(response.json().requestId, 'trace-1', `${method} ${url}: ${response.body}`);
    assert.equal(response.headers['x-request-id'], 'trace-1');
  }
});

test('#93 GET /health/ready публичный и сообщает число обращений', async t => {
  const app = buildApp(); t.after(() => app.close());
  const response = await app.inject({ url: '/health/ready' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ready', complaints: app.store.list().length });
  assert.ok(response.json().complaints > 0);
});

test('#93 журнал: одна JSON-строка на запрос без строки запроса, с requestId', async t => {
  const lines = [];
  const stream = new Writable({ write(chunk, _enc, done) { lines.push(...String(chunk).split('\n').filter(Boolean)); done(); } });
  const app = buildApp({ logger: { level: 'info', stream } }); t.after(() => app.close());
  await app.inject({ url: '/complaints?q=секрет', headers: { ...user, 'x-request-id': 'log-1' } });
  const entries = lines.map(line => JSON.parse(line)).filter(entry => entry.requestId === 'log-1');
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.method, 'GET');
  assert.equal(entry.path, '/complaints');
  assert.equal(entry.status, 200);
  assert.equal(typeof entry.ms, 'number');
  assert.ok(!lines.join('\n').includes('секрет'));
});

test('#93 LOG_LEVEL=silent: журнал пуст', async t => {
  const lines = [];
  const stream = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done(); } });
  const app = buildApp({ logger: { level: 'silent', stream } }); t.after(() => app.close());
  await app.inject({ url: '/health' });
  assert.deepEqual(lines, []);
});
