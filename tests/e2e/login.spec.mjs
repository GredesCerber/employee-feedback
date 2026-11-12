// Условный вход (#288): экран выбора роли без пароля, вход и выход.
import { test, expect } from '@playwright/test';

test('вход по ролям и выход', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Вход в систему' })).toBeVisible();
  await page.getByRole('button', { name: /Войти как руководитель/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Очередь обращений' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Очередь обращений' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByRole('button', { name: /Войти как администратор/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Сводка' })).toBeVisible();
});
