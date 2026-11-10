import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { buildApp } = await import('../../api/dist/app.js');
const { version } = JSON.parse(await readFile(new URL('../../api/package.json', import.meta.url), 'utf8'));

test('#48 GET /health responds with HTTP 200 and the package version', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.json().version, version);
  assert.match(response.json().version, /^\d+\.\d+\.\d+/);
});

test('#48 a running API serves /health over HTTP', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await fetch(`${address}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, version);
});
