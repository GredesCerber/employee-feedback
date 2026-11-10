import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('#116 «Имитация» badges, demo step hints with memory, «О прототипе» page in sync with docs', () => {
  const result = spawnSync(process.execPath, ['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/demo-honesty.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 180_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
