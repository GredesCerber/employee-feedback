import { test, expect } from '@playwright/test';

// Условный вход (#288): каждый переход в тесте начинается сотрудником, как раньше; экран входа проверяет login.spec.mjs.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('demo-session', 'employee-1')); });

// Роль живёт в памяти SPA: выбираем её после первого перехода и далее используем меню.
const matrix = [
  { role: 'employee', links: [ ['Мои обращения', '/my'], ['Новое обращение', '/submit'] ] },
  { role: 'manager', links: [ ['Очередь обращений', '/queue'], ['Дашборд', '/dashboard'] ] },
  // «Пользователи и права» добавлены в меню администратора в #375.
  { role: 'admin', links: [ ['Сводка', '/summary'], ['Дашборд', '/dashboard'], ['Пользователи и права', '/admin'] ] },
];

async function openAs(page, role) {
  await page.goto('/');
  await page.getByLabel('Демонстрационная роль').selectOption(role);
}

for (const { role, links } of matrix) {
  test(`${role}: каждый пункт меню ведёт на свою страницу без редиректа`, async ({ page }) => {
    await openAs(page, role);
    const navigation = page.getByRole('navigation', { name: 'Основное меню' });
    await expect(navigation.getByRole('link'), `${role}: набор пунктов меню`).toHaveCount(links.length);
    for (const [label, path] of links) {
      await test.step(`${role}: ${label} → ${path}`, async () => {
        const link = navigation.getByRole('link', { name: label, exact: true });
        await expect(link, `${role}: ссылка «${label}» доступна`).toBeVisible();
        await expect(link, `${role}: адрес «${label}»`).toHaveAttribute('href', path);
        await link.click();
        await expect(page, `${role}: «${label}» не должен перенаправлять`).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByRole('heading', { level: 1, name: label, exact: true }), `${role}: заголовок страницы «${label}»`).toBeVisible();
      });
    }
  });
}

test('employee: при попытке открыть очередь CSV недоступен', async ({ page }) => {
  await openAs(page, 'employee');
  // SPA-навигация по прямой ссылке проверяет защиту маршрута, сохраняя выбранную роль.
  await page.evaluate(() => { history.pushState({}, '', '/queue'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page, 'сотрудник перенаправляется с очереди').toHaveURL(/\/my$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Мои обращения' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Скачать CSV' }), 'CSV не должен отображаться сотруднику').toHaveCount(0);
});

test('employee ↔ manager: открытая карточка сохраняется при переключении роли (#203)', async ({ page }) => {
  await openAs(page, 'employee');
  const first = page.locator('.complaint-list').getByRole('link', { name: /^A-\d+$/ }).first();
  await expect(first, 'в синтетических данных сотрудника должно быть обращение').toBeVisible();
  const number = (await first.textContent()).trim();
  await first.click();
  await expect(page.getByRole('heading', { level: 1, name: `Обращение ${number}` })).toBeVisible();
  const employeeUrl = new URL(page.url());
  const id = employeeUrl.pathname.slice('/my/'.length);
  expect(id, 'идентификатор карточки в адресе').toBeTruthy();
  await page.getByLabel('Демонстрационная роль').selectOption('manager');
  await expect(page, 'руководителю открыта та же карточка').toHaveURL(new RegExp(`/queue/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Обращение ${number}` })).toBeVisible();
  await page.getByLabel('Демонстрационная роль').selectOption('employee');
  await expect(page, 'сотруднику возвращена та же карточка').toHaveURL(new RegExp(`/my/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Обращение ${number}` })).toBeVisible();
});

test('admin: обновление сводки и отмена сброса работают без изменения данных', async ({ page }) => {
  await openAs(page, 'admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Сводка' })).toBeVisible();
  const refresh = page.getByRole('button', { name: 'Обновить сводку' });
  await expect(refresh).toBeVisible();
  const request = page.waitForResponse(response => response.url().endsWith('/summary') && response.request().method() === 'GET');
  await refresh.click();
  expect((await request).ok(), 'обновление сводки должно получить успешный ответ').toBe(true);
  await expect(refresh).toBeVisible();
  await expect(page.getByRole('main').locator('a[href^="/queue"]'), 'администратору не должны предлагаться недоступные ссылки очереди (#282)').toHaveCount(0);
  await expect(page.getByRole('main').getByText('Очередь доступна руководителю', { exact: true }).first(), 'сводка объясняет, кому доступна очередь (#282)').toBeVisible();
  await page.getByRole('button', { name: 'Сбросить демо' }).click();
  const confirmation = page.getByRole('group', { name: 'Подтверждение сброса демо' });
  await expect(confirmation.getByRole('button', { name: 'Подтвердить сброс' })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Отмена' }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сбросить демо' })).toBeVisible();
});
