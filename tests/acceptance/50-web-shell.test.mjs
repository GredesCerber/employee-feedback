import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
test('Given a clean install, the web suite verifies role menus and routing', () => {
  // The required web-test step runs the full UI suite. This probe covers role navigation and route access.
  const result = spawnSync(process.execPath, [
    'web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', '--maxWorkers=1',
    'tests/shell.test.tsx', 'tests/role-access-notice.test.tsx',
  ], {
    cwd: root, encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
