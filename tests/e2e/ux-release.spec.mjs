import { test, expect } from '@playwright/test';

// Условный вход (#288): каждый переход в тесте начинается сотрудником, как раньше; экран входа проверяет login.spec.mjs.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('demo-session', 'employee-1')); });

test('UX: optional point, invalid draft, saved map, resume and honest translation failure', async ({ page }) => {
  await page.route('**://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/submit');
  await page.getByLabel('Категория', { exact: true }).selectOption('cross_department');
  const text = `UX-map-${Date.now()} Нужно улучшить вентиляцию на складе.`;
  await page.getByLabel('Описание', { exact: true }).fill(text);
  await page.locator('summary').filter({ hasText: 'Указать место на карте' }).click();
  await page.getByLabel('Широта', { exact: true }).fill('155');
  await page.getByLabel('Долгота', { exact: true }).fill('73.37');
  await page.getByRole('button', { name: 'Отправить обращение', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Проверьте широту' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toHaveCount(0);
  await page.getByLabel('Широта', { exact: true }).fill('55.01');
  await page.getByRole('button', { name: 'Отправить обращение', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
  await page.getByRole('link', { name: 'Открыть обращение' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  const path = new URL(page.url()).pathname;
  const id = path.split('/').pop();
  const response = await page.request.get(`/api/complaints/${id}`, { headers: { 'X-Demo-User': 'employee-1' } });
  expect((await response.json()).location).toEqual({ latitude: 55.01, longitude: 73.37 });
  await expect(page.locator('summary').filter({ hasText: 'Место на карте' })).toContainText('55.01, 73.37');
  await page.locator('nav a[href="/my"]').click();
  await page.getByRole('button', { name: 'Вернуться к обращению', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  const message = page.locator('.translation').first();
  await message.getByRole('combobox').selectOption('en');
  const translation = page.waitForResponse(response => response.url().endsWith('/translations'));
  await message.getByRole('button', { name: 'Перевести', exact: true }).click();
  expect((await translation).status()).toBe(503);
  await expect(message.getByRole('alert')).toContainText('Перевод сейчас недоступен');
  await expect(message.getByText(text, { exact: true })).toBeVisible();
});

test('UX: interface languages preserve form values, role changes and reload; theme and reduced motion', async ({ page }) => {
  await page.goto('/submit');
  await page.locator('#description').fill('Текст не должен исчезнуть при смене языка.');
  const selector = page.getByRole('combobox', { name: 'Language / Язык / Тіл' });
  await selector.selectOption('en');
  await expect(page.getByRole('heading', { name: 'New request', exact: true })).toBeVisible();
  await expect(page.locator('#description')).toHaveValue('Текст не должен исчезнуть при смене языка.');
  await selector.selectOption('kk');
  await expect(page.getByRole('heading', { name: 'Жаңа өтініш', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  await expect(page.locator('#description')).toHaveValue('Текст не должен исчезнуть при смене языка.');
  await selector.selectOption('en');
  await page.locator('.role-selector select').first().selectOption('manager');
  await expect(page.getByRole('heading', { name: 'Request queue', exact: true })).toBeVisible();
  await page.reload();
  await expect(selector).toHaveValue('en');
  await page.locator('.theme-selector select').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.locator('.role-selector select').first().evaluate(element => getComputedStyle(element).transitionDuration);
  expect(duration.split(',').every(value => Number.parseFloat(value) <= 0.00001)).toBe(true);
});
