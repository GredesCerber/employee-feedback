import assert from 'node:assert/strict';
import { runVitest } from './run-vitest.mjs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('Manager filters, assigns, requests clarification and records visible decisions', async () => {
  const result = await runVitest(['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/manager.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
