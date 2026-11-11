import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('#233 CSV export supports response Blobs from another realm and rejects missing data', () => {
  const result = spawnSync(process.execPath, ['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/csv-blob.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
