import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

test('#286 dashboard sections collapse, sort and limit category rows', () => {
  const web = fileURLToPath(new URL('../../web/', import.meta.url));
  const vitest = fileURLToPath(new URL('../../web/node_modules/vitest/vitest.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [vitest, 'run', 'tests/dashboard-sections.test.tsx'], { cwd: web, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
