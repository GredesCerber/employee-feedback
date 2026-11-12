import assert from 'node:assert/strict';
import { runVitest } from './run-vitest.mjs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('#153 weekly digest displays sources, safe text, filters, loading and retry', async () => {
  const result = await runVitest(['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/weekly-digest.test.tsx', 'tests/submit-assist-pending.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
