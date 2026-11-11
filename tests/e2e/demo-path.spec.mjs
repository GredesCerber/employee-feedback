// Сквозной тест демо-пути (#57, R12): 6 шагов сценария из docs/tz-analysis.md §1
// на синтетических данных, без ручных действий.
// Роль хранится в памяти SPA и сбрасывается при перезагрузке, поэтому после первого
// открытия страницы ходим только по ссылкам и переключателю роли — без page.goto.
import { test, expect } from '@playwright/test';

const run = `e2e-${Date.now().toString(36)}`;
const roles = { employee: 'employee', manager: 'manager', admin: 'admin' };

async function switchRole(page, role) {
  await page.getByLabel('Демонстрационная роль').selectOption(roles[role]);
}

function field(page, label) {
  return page.locator('.metadata > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
}

/** Селект фильтра очереди: подпись оборачивает select, поэтому ищем по началу текста подписи. */
function filterSelect(page, label) {
  return page.locator('form.filter-form label').filter({ hasText: new RegExp(`^${label}`) }).locator('select');
}

async function expectStatus(page, label) {
  await expect(page.locator('.detail-header .status-badge')).toHaveText(label);
}

async function submitComplaint(page, { categoryId, description, solution, attachment }) {
  await page.getByRole('navigation', { name: 'Основное меню' }).getByRole('link', { name: 'Новое обращение' }).click();
  await page.getByLabel('Тип обращения').selectOption('problem');
  await page.getByLabel('Категория').selectOption(categoryId);
  await page.getByLabel('Описание').fill(description);
  if (solution) await page.getByLabel(/Предлагаемое решение/).fill(solution);
  if (attachment) await page.getByLabel('Добавить тестовое вложение').check();
  await page.getByRole('button', { name: 'Отправить обращение' }).click();
  await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
  const number = (await page.locator('.registration-number').textContent())?.trim() ?? '';
  expect(number).toMatch(/^A-\d{3,}$/);
  return number;
}

/** Руководитель находит обращение поиском по номеру и открывает карточку. */
async function openInQueue(page, number) {
  await page.getByRole('navigation', { name: 'Основное меню' }).getByRole('link', { name: 'Очередь обращений' }).click();
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await page.getByLabel('Поиск по номеру или тексту').fill(number);
  await page.getByRole('button', { name: 'Применить фильтры' }).click();
  await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).click();
  await expect(page.getByRole('heading', { name: `Обращение ${number}` })).toBeVisible();
}

async function openMine(page, number) {
  await page.getByRole('navigation', { name: 'Основное меню' }).getByRole('link', { name: 'Мои обращения' }).click();
  await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).click();
  await expect(page.getByRole('heading', { name: `Обращение ${number}` })).toBeVisible();
}

test('демо-путь: подача → назначение → уточнение → решение → фильтры → сводка', async ({ page }) => {
  const routed = { description: `[${run}] В заявках на оборудование не хватает назначения изделия.`, number: '' };
  const fallback = { description: `[${run}] Обращение по категории без правила маршрутизации.`, number: '' };
  const question = `[${run}] Пришлите пример корректно заполненной заявки.`;
  const answer = `[${run}] Пример приложен: заявка на насосное оборудование.`;
  const accepted = `[${run}] Добавили обязательные поля в шаблон заявки.`;
  const refusal = `[${run}] Отказ: вопрос уже решён в текущем регламенте закупок.`;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Мои обращения' })).toBeVisible();

  await test.step('1. Сотрудник подаёт обращение и получает номер', async () => {
    routed.number = await submitComplaint(page, {
      categoryId: 'cross_department', description: routed.description,
      solution: 'Сделать поля «назначение» и «параметры» обязательными.', attachment: true,
    });
    await page.getByRole('link', { name: 'Открыть обращение' }).click();
    await expect(page.getByRole('heading', { name: `Обращение ${routed.number}` })).toBeVisible();
    await expectStatus(page, 'Новое');
    await expect(page.getByText('sample-request.txt')).toBeVisible();
    await expect(page.getByText(routed.description)).toBeVisible();
  });

  await test.step('2. Ответственный назначается по категории; без правила — запасная очередь', async () => {
    await expect(field(page, 'Ответственный')).toHaveText('Руководитель закупок');
    await expect(field(page, 'Срок')).not.toHaveText('');

    fallback.number = await submitComplaint(page, { categoryId: 'no_rule_demo', description: fallback.description });
    await page.getByRole('link', { name: 'Открыть обращение' }).click();
    await expect(field(page, 'Ответственный')).toHaveText('Ожидает назначения');

    // После #203 смена роли на карточке ведёт на парную карточку /queue/:id, поэтому в очередь идём через меню.
    await switchRole(page, 'manager');
    await page.getByRole('navigation', { name: 'Основное меню' }).getByRole('link', { name: 'Очередь обращений' }).click();
    await expect(page.getByRole('heading', { name: 'Очередь обращений' })).toBeVisible();
    await filterSelect(page, 'Очередь').selectOption('unassigned');
    await page.getByRole('button', { name: 'Применить фильтры' }).click();
    const item = page.locator('.complaint-item').filter({ hasText: fallback.number });
    await expect(item).toContainText('Без ответственного');
    await item.getByRole('link', { name: fallback.number, exact: true }).click();

    await page.getByLabel('Назначить ответственного').selectOption('manager-1');
    await page.getByRole('button', { name: 'Назначить', exact: true }).click();
    await expect(field(page, 'Ответственный')).toHaveText('Руководитель закупок');
  });

  await test.step('3. Руководитель меняет статус и запрашивает уточнение, автор отвечает', async () => {
    await openInQueue(page, routed.number);
    await page.getByRole('button', { name: 'Начать рассмотрение' }).click();
    await expectStatus(page, 'На рассмотрении');
    await page.getByLabel('Комментарий или вопрос').fill(question);
    await page.getByRole('button', { name: 'Запросить уточнение' }).click();
    await expectStatus(page, 'Ожидает уточнения');

    await switchRole(page, 'employee');
    await openMine(page, routed.number);
    await expect(page.getByRole('heading', { name: 'Ответить на уточнение' })).toBeVisible();
    await expect(page.locator('blockquote')).toHaveText(question);
    await page.getByLabel('Ваш ответ на уточнение').fill(answer);
    await page.getByRole('button', { name: 'Отправить ответ' }).click();
    await expectStatus(page, 'На рассмотрении');

    await switchRole(page, 'manager');
    await openInQueue(page, routed.number);
    const comments = page.locator('ul.timeline');
    await expect(comments).toContainText(question);
    await expect(comments).toContainText(answer);
    await expect(page.locator('ol.timeline > li')).not.toHaveCount(1);
  });

  await test.step('4. Одно обращение решено, другое — мотивированный отказ; автор видит итог', async () => {
    await page.getByLabel('Итог рассмотрения').selectOption('implemented');
    await page.getByLabel('Обоснование решения').fill(accepted);
    await page.getByRole('button', { name: 'Зафиксировать итог' }).click();
    await expectStatus(page, 'Реализовано');
    await expect(page.getByRole('heading', { name: 'Обработка обращения' })).toHaveCount(0);

    await openInQueue(page, fallback.number);
    await page.getByLabel('Итог рассмотрения').selectOption('rejected');
    // После #204 поле объяснения при отказе подписано «Мотивированный отказ».
    await page.getByLabel('Мотивированный отказ').fill(refusal);
    await page.getByRole('button', { name: 'Зафиксировать итог' }).click();
    await expectStatus(page, 'Отклонено');

    await switchRole(page, 'employee');
    await openMine(page, routed.number);
    await expect(page.locator('.decision')).toContainText('Реализовано');
    await expect(page.locator('.decision')).toContainText(accepted);
    await openMine(page, fallback.number);
    await expect(page.locator('.decision')).toContainText('Отклонено');
    await expect(page.locator('.decision')).toContainText(refusal);
  });

  await test.step('5. Руководитель фильтрует по подразделению, категории, статусу, сроку и находит просроченные', async () => {
    // Смена роли с карточки автора снова ведёт на /queue/:id (#203): в очередь идём через меню.
    await switchRole(page, 'manager');
    await page.getByRole('navigation', { name: 'Основное меню' }).getByRole('link', { name: 'Очередь обращений' }).click();
    await expect(page.getByRole('heading', { name: 'Очередь обращений' })).toBeVisible();
    const filters = page.locator('form.filter-form');
    await filterSelect(page, 'Подразделение').selectOption('procurement');
    await filterSelect(page, 'Категория').selectOption('cross_department');
    await filterSelect(page, 'Статус').selectOption('implemented');
    await page.getByRole('button', { name: 'Применить фильтры' }).click();
    await expect(page.locator('.complaint-list').getByRole('link', { name: routed.number, exact: true })).toBeVisible();
    const badges = page.locator('.complaint-item .status-badge');
    for (const text of await badges.allTextContents()) expect(text).toBe('Реализовано');

    await page.getByRole('button', { name: 'Сбросить' }).click();
    // Синтетические обращения из набора имеют срок 08.11.2026 и к моменту демо просрочены.
    await filters.getByLabel('Срок от').fill('2026-11-08');
    await filters.getByLabel('Срок до').fill('2026-11-08');
    await filters.getByLabel('Только просроченные').check();
    await page.getByRole('button', { name: 'Применить фильтры' }).click();
    const items = page.locator('.complaint-item');
    await expect(items.first()).toBeVisible();
    const found = Number((await page.getByText(/^Найдено: \d+$/).textContent())?.replace(/\D/g, ''));
    expect(found).toBeGreaterThan(0);
    for (const text of await items.allTextContents()) expect(text).toContain('Просрочено');
    await expect(page.locator('.complaint-list').getByRole('link', { name: routed.number, exact: true })).toHaveCount(0);
  });

  await test.step('6. Администратор открывает сводку', async () => {
    await switchRole(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Сводка', exact: true })).toBeVisible();
    const total = page.locator('section[aria-labelledby="summary-total"] .metric-value');
    await expect(total).toHaveText(/\d+/);
    expect(Number((await total.textContent())?.replace(/\D/g, ''))).toBeGreaterThanOrEqual(22);
    await expect(page.locator('section[aria-labelledby="summary-closed"] .metric-value')).toHaveText(/%/);
    await expect(page.locator('section[aria-labelledby="summary-response"] .metric-value')).toHaveText(/ч$/);
    const byType = page.getByRole('table', { name: 'Обращения по типам' });
    for (const type of ['Проблема', 'Предложение', 'Благодарность']) {
      await expect(byType.getByRole('rowheader', { name: type })).toBeVisible();
    }
    await expect(page.getByRole('table', { name: 'Повторяющиеся темы' })
      .getByRole('rowheader', { name: 'Межотдельное взаимодействие' })).toBeVisible();
  });
});
