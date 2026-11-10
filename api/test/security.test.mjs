import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

test('CORS rejects wildcard and non-origin configuration instead of broadening access', t => {
  const previous = process.env.CORS_ORIGINS;
  t.after(() => previous === undefined ? delete process.env.CORS_ORIGINS : process.env.CORS_ORIGINS = previous);
  for (const value of ['*', 'null', 'file:///tmp', 'https://a.test/path', 'https://user:pass@a.test', 'https://a.test?x=1']) {
    process.env.CORS_ORIGINS = value;
    assert.throws(() => buildApp(), /CORS_ORIGINS/);
  }
});
