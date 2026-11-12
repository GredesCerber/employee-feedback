import assert from 'node:assert/strict';
import { runVitest } from './run-vitest.mjs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('#114 loading after 300 ms, 5xx/network with retry, 429 with Retry-After, empty states', async () => {
  const result = await runVitest(['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/states.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 180_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
