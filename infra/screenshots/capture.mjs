// Снимает скриншоты для корневого README.md (#299) с уже запущенного демо.
// Запуск (демо поднято командой `npm run demo -- --web-port 5173`):
//   node infra/screenshots/capture.mjs --base-url http://127.0.0.1:5173
// Нужен Playwright из tests/e2e: `npm --prefix tests/e2e ci && npm --prefix tests/e2e run e2e:install`.
// Скрипт проходит демо-путь на синтетических данных и сохраняет PNG рядом с собой.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../tests/e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const index = process.argv.indexOf('--base-url');
const base = (index > 0 ? process.argv[index + 1] : '') || 'http://127.0.0.1:5173';
const out = name => fileURLToPath(new URL(`./${name}.png`, import.meta.url));

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: base, viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2,
  locale: 'ru-RU', timezoneId: 'Asia/Omsk', colorScheme: 'light',
});
const page = await context.newPage();
const menu = () => page.getByRole('navigation', { name: 'Основное меню' });
const role = value => page.getByLabel('Демонстрационная роль').selectOption(value);
const shot = async (name, options = {}) => {
  await page.waitForLoadState('networkidle');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: out(name), ...options });
  console.log(`saved ${name}.png`);
};

const description = 'В заявках на оборудование не хватает поля «назначение изделия», из-за этого снабжение уточняет детали по телефону.';
const question = 'Пришлите, пожалуйста, пример заявки, где не хватило данных.';
const answer = 'Пример: заявка на насосное оборудование, не указан объект и режим работы.';
const decision = 'Добавили обязательные поля «назначение» и «параметры» в шаблон заявки.';

await page.goto('/');
await page.getByRole('heading', { name: 'Мои обращения' }).waitFor();

// 1. Подача обращения (форма заполнена, до отправки).
await menu().getByRole('link', { name: 'Новое обращение' }).click();
await page.getByLabel('Тип обращения').selectOption('problem');
await page.getByLabel('Категория').selectOption('cross_department');
await page.getByLabel('Описание').fill(description);
await page.getByLabel(/Предлагаемое решение/).fill('Сделать поля «назначение» и «параметры» обязательными.');
await page.getByLabel('Добавить тестовое вложение').check();
await shot('01-submit', { fullPage: true });
await page.getByRole('button', { name: 'Отправить обращение' }).click();
await page.getByRole('heading', { name: 'Обращение зарегистрировано' }).waitFor();
const number = (await page.locator('.registration-number').textContent()).trim();

// 2. Руководитель берёт в работу и запрашивает уточнение, автор отвечает, руководитель фиксирует итог.
const openInQueue = async () => {
  await menu().getByRole('link', { name: 'Очередь обращений' }).click();
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await page.getByLabel('Поиск по номеру или тексту').fill(number);
  await page.getByRole('button', { name: 'Применить фильтры' }).click();
  await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).click();
  await page.getByRole('heading', { name: `Обращение ${number}` }).waitFor();
};
const openMine = async () => {
  await menu().getByRole('link', { name: 'Мои обращения' }).click();
  await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).click();
  await page.getByRole('heading', { name: `Обращение ${number}` }).waitFor();
};
await role('manager');
await openInQueue();
await page.getByRole('button', { name: 'Начать рассмотрение' }).click();
await page.getByLabel('Комментарий или вопрос').fill(question);
await page.getByRole('button', { name: 'Запросить уточнение' }).click();
await page.locator('.detail-header .status-badge', { hasText: 'Ожидает уточнения' }).waitFor();
await role('employee');
await openMine();
await page.getByLabel('Ваш ответ на уточнение').fill(answer);
await page.getByRole('button', { name: 'Отправить ответ' }).click();
await page.locator('.detail-header .status-badge', { hasText: 'На рассмотрении' }).waitFor();
await role('manager');
await openInQueue();
await shot('04-manager-card', { fullPage: true });
await page.getByLabel('Итог рассмотрения').selectOption('implemented');
await page.getByLabel('Обоснование решения').fill(decision);
await page.getByRole('button', { name: 'Зафиксировать итог' }).click();
await page.locator('.detail-header .status-badge', { hasText: 'Реализовано' }).waitFor();

// 3. Автор: список «Мои обращения» и карточка с историей и итогом.
await role('employee');
await menu().getByRole('link', { name: 'Мои обращения' }).click();
await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).waitFor();
await shot('02-my-complaints');
await openMine();
await shot('03-complaint-outcome', { fullPage: true });

// 4. Очередь руководителя.
await role('manager');
await menu().getByRole('link', { name: 'Очередь обращений' }).click();
await page.getByRole('button', { name: 'Сбросить' }).click();
await page.locator('.complaint-item').first().waitFor();
await shot('05-manager-queue');

// 5. Сводка администратора и дашборд.
await role('admin');
await page.getByRole('heading', { name: 'Сводка', exact: true }).waitFor();
// Переход по меню убирает подсказку о смене роли, оставшуюся после редиректа с очереди.
await menu().getByRole('link', { name: 'Дашборд' }).click();
await menu().getByRole('link', { name: 'Сводка' }).click();
await page.getByRole('heading', { name: 'Сводка', exact: true }).waitFor();
await page.locator('section[aria-labelledby="summary-total"] .metric-value').waitFor();
await shot('06-admin-summary');
await menu().getByRole('link', { name: 'Дашборд' }).click();
await page.waitForTimeout(800);
await shot('07-dashboard');

await browser.close();
console.log(`complaint ${number}`);
