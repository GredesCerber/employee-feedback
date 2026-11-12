// #351: экран «Сервер просыпается» при холодном старте Render — ожидание с повтором каждые 3 с,
// автоматическое исчезновение после ответа API и ошибка с «Повторить» после 90 с. Запросы мокаются.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

test('#351 waking screen retries every 3 s, hides on answer and offers Retry after 90 s', () => {
  const web = fileURLToPath(new URL('../../web/', import.meta.url));
  const vitest = fileURLToPath(new URL('../../web/node_modules/vitest/vitest.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [vitest, 'run', 'tests/server-waking.test.tsx'], { cwd: web, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
