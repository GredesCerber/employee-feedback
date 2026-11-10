import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

test('malformed JSON, unsupported media and oversized body return safe contract errors', async t => {
  const app = buildApp({ bodyLimit: 100 });
  t.after(() => app.close());
  const before = app.store.list();
  for (const [payload, contentType, status, code] of [
    ['{', 'application/json', 400, 'BAD_REQUEST'],
    ['plain', 'text/plain', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [JSON.stringify({ description: 'x'.repeat(200) }), 'application/json', 413, 'PAYLOAD_TOO_LARGE'],
  ]) {
    const response = await app.inject({ method: 'POST', url: '/complaints', payload,
      headers: { 'content-type': contentType, 'x-demo-user': 'employee-1' } });
    assert.equal(response.statusCode, status);
    assert.equal(response.json().code, code);
    assert.deepEqual(Object.keys(response.json()).sort(), ['code', 'message']);
  }
  assert.deepEqual(app.store.list(), before);
});
