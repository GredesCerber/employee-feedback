import { runVitest } from './run-vitest.mjs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

test('#286 dashboard sections collapse, sort and limit category rows', async () => {
  const web = fileURLToPath(new URL('../../web/', import.meta.url));
  const vitest = fileURLToPath(new URL('../../web/node_modules/vitest/vitest.mjs', import.meta.url));
  const result = await runVitest([vitest, 'run', 'tests/dashboard-sections.test.tsx'], { cwd: web, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
