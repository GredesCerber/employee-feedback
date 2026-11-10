import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('#200 manager comments clear after success, survive errors, and cannot submit twice while pending', () => {
  const result = spawnSync(process.execPath, ['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/manager-comment.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
