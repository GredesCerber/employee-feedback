// Расширенный демо-путь (#133, R12): новые функции поверх базового сценария.
// Подача анонимно → у руководителя «Аноним» → смена статуса → «Отменить действие» → статус вернулся →
// поиск по слову → CSV без автора → колокольчик у автора показывает событие.
// Роль хранится в памяти SPA и сбрасывается при перезагрузке, поэтому после page.goto('/')
// ходим только по меню и переключателю роли.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Условный вход (#288): каждый переход в тесте начинается сотрудником, как раньше; экран входа проверяет login.spec.mjs.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('demo-session', 'employee-1')); });

const run = `ext-${Date.now().toString(36)}`;
const authorName = 'Сотрудник закупок';

const nav = page => page.getByRole('navigation', { name: 'Основное меню' });
const switchRole = (page, role) => page.getByLabel('Демонстрационная роль').selectOption(role);
const expectStatus = (page, label) => expect(page.locator('.detail-header .status-badge')).toHaveText(label);

function field(page, label) {
  return page.locator('.metadata > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
}

test('расширенный демо-путь: аноним → откат → поиск → CSV → уведомление', async ({ page }) => {
  const description = `[${run}] Квазарный регламент согласования заявок слишком долгий.`;
  const question = `[${run}] Уточните, о каком регламенте речь.`;
  let number = '';

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Мои обращения' })).toBeVisible();

  await test.step('1. Сотрудник подаёт обращение анонимно', async () => {
    await nav(page).getByRole('link', { name: 'Новое обращение' }).click();
    await page.getByLabel('Тип обращения').selectOption('problem');
    await page.getByLabel('Категория').selectOption('cross_department');
    await page.getByLabel('Описание').fill(description);
    await page.getByLabel('Подать анонимно').check();
    await page.getByRole('button', { name: 'Отправить обращение' }).click();
    await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
    number = (await page.locator('.registration-number').textContent())?.trim() ?? '';
    expect(number).toMatch(/^A-\d{3,}$/);
    await page.getByRole('link', { name: 'Открыть обращение' }).click();
    await expect(page.getByRole('heading', { name: `Обращение ${number}` })).toBeVisible();
    // Сам автор видит, что подача анонимна только для руководителей.
    await expect(field(page, 'Автор')).toContainText('анонимно для руководителей');
  });

  await test.step('2. Руководитель видит автора как «Аноним»', async () => {
    await switchRole(page, 'manager');
    await nav(page).getByRole('link', { name: 'Очередь обращений' }).click();
    await page.getByLabel('Поиск по номеру или тексту').fill(number);
    await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).click();
    await expect(page.getByRole('heading', { name: `Обращение ${number}` })).toBeVisible();
    await expect(field(page, 'Автор')).toHaveText('Аноним');
    await expect(page.locator('main')).not.toContainText(authorName);
  });

  await test.step('3. Смена статуса и «Отменить действие» возвращают статус', async () => {
    await expectStatus(page, 'Новое');
    await page.getByRole('button', { name: 'Начать рассмотрение' }).click();
    await expectStatus(page, 'На рассмотрении');
    await expect(page.getByText(/Осталось для отмены: \d+:\d{2}/)).toBeVisible();
    await page.getByRole('button', { name: 'Отменить действие' }).click();
    await expectStatus(page, 'Новое');
    await expect(page.getByRole('button', { name: 'Отменить действие' })).toHaveCount(0);
  });

  await test.step('4. Поиск по слову находит обращение', async () => {
    await nav(page).getByRole('link', { name: 'Очередь обращений' }).click();
    await page.getByLabel('Поиск по номеру или тексту').fill('Квазарный');
    const link = page.locator('.complaint-list').getByRole('link', { name: number, exact: true });
    await expect(link).toBeVisible();
    await expect(page.locator('.complaint-item').filter({ hasText: number })).not.toContainText(authorName);
  });

  await test.step('5. CSV не содержит автора', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Скачать CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const csv = (await readFile(await download.path(), 'utf8')).replace(/^﻿/, '');
    const [header, ...rows] = csv.split(/\r\n/).filter(Boolean);
    expect(header.split(',')[0]).toBe('номер');
    expect(rows.some(row => row.startsWith(number + ','))).toBe(true);
    expect(csv).not.toContain(authorName);
    expect(csv).not.toContain('employee-1');
    expect(header).not.toMatch(/автор/i);
  });

  await test.step('6. Колокольчик у автора показывает событие', async () => {
    await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).click();
    await page.getByLabel('Комментарий или вопрос').fill(question);
    await page.getByRole('button', { name: 'Запросить уточнение' }).click();
    await expectStatus(page, 'Ожидает уточнения');

    await switchRole(page, 'employee');
    const bell = page.getByRole('button', { name: /^Уведомления/ });
    await expect(bell).toHaveAccessibleName(/новых: \d+/);
    await bell.click();
    const panel = page.getByRole('region', { name: 'Уведомления' });
    await expect(panel.getByRole('link', { name: `По обращению ${number} запрошено уточнение.` })).toBeVisible();
    await expect(panel).toContainText('Имитация');
  });
});
