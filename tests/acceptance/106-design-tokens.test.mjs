import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('#106 design tokens: colours only in tokens.css, WCAG contrast in both themes, remembered theme switch', () => {
  const result = spawnSync(process.execPath, ['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/tokens.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 180_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
