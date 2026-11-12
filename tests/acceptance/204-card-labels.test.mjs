import assert from 'node:assert/strict';
import { runVitest } from './run-vitest.mjs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('#204 card labels: assignee option, reject hint, «Мотивированный отказ», demo step number', async () => {
  const result = await runVitest(['web/node_modules/vitest/vitest.mjs', 'run', '--root', 'web', 'tests/card-labels.test.tsx'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
