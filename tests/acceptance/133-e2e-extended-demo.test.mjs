// Приёмка #133: расширенный E2E-путь. Сам браузерный прогон — не часть hk check
// (npm --prefix tests/e2e run e2e), здесь проверяем, что спека и конфиг соответствуют критериям.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const specPath = 'tests/e2e/extended-demo.spec.mjs';

test('#133 спека extended-demo.spec.mjs существует и подхватывается конфигом', () => {
  assert.ok(existsSync(new URL(`../../${specPath}`, import.meta.url)));
  assert.match(read('tests/e2e/playwright.config.mjs'), /testMatch:\s*'\*\.spec\.mjs'/);
  assert.match(read('tests/e2e/package.json'), /"e2e":\s*"playwright test"/);
});

test('#133 сценарий покрывает все шаги: аноним, откат, поиск, CSV без автора, колокольчик', () => {
  const spec = read(specPath);
  for (const needle of [
    'Подать анонимно', 'Аноним', 'Начать рассмотрение', 'Отменить действие',
    'Поиск по номеру или тексту', 'Скачать CSV', 'download', 'Уведомления',
  ]) assert.ok(spec.includes(needle), `в спеке нет «${needle}»`);
  assert.match(spec, /Сотрудник закупок/, 'CSV проверяется на отсутствие имени автора');
  assert.match(spec, /not\.toContain|not\.toMatch/, 'есть отрицательная проверка CSV');
});

test('#133 demo-path.spec.mjs не тронут (нет ссылок на новые сценарии)', () => {
  assert.doesNotMatch(read('tests/e2e/demo-path.spec.mjs'), /extended-demo|Скачать CSV/);
});

test('#133 трейс и скриншот выключены по умолчанию и включаются через --trace on', () => {
  const config = read('tests/e2e/playwright.config.mjs');
  assert.match(config, /trace:\s*'off'/);
  assert.doesNotMatch(config, /retain-on-failure/);
  assert.match(config, /screenshot:[^\n]*E2E_TRACE[^\n]*'off'/);
  assert.match(config, /--trace/);
});

test('#133 запуск без Docker: api и web поднимает playwright.config.mjs', () => {
  const config = read('tests/e2e/playwright.config.mjs');
  assert.match(config, /webServer/);
  assert.match(config, /api run build && npm --prefix api start/);
  assert.match(config, /web run dev/);
  assert.doesNotMatch(config, /docker/i);
});
