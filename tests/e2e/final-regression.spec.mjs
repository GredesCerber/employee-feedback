// Финальная регрессия демо (#301, R1-R7, R8, R10, R12): итоговое состояние глазами трёх ролей,
// ошибки и восстановление, ИИ без ключа, console/network. Только синтетические данные, без внешних сервисов.
// Роль хранится в памяти SPA и сбрасывается при перезагрузке: после page.goto ходим по меню и переключателю роли.
// Пересечения с другими спеками описаны в final-regression.md.
import { test, expect } from '@playwright/test';

// Условный вход (#288): каждый переход в тесте начинается сотрудником, как раньше; экран входа проверяет login.spec.mjs.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('demo-session', 'employee-1')); });

const run = `fr-${Date.now().toString(36)}`;
const authorName = 'Сотрудник закупок';
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

const nav = page => page.getByRole('navigation', { name: 'Основное меню' });
const switchRole = (page, role) => page.getByLabel('Демонстрационная роль').selectOption(role);
const expectStatus = (page, label) => expect(page.locator('.detail-header .status-badge')).toHaveText(label);
const tile = (page, id) => page.locator(`section[aria-labelledby="${id}"] .metric-value`);
const numberOf = async locator => Number((await locator.textContent())?.replace(/\D/g, ''));
const isComplaintPost = request => request.method() === 'POST' && /\/api\/complaints$/.test(new URL(request.url()).pathname);

/** Требования ТЗ, которые проверяет тест: видны в отчёте Playwright как аннотации. */
function requirements(...codes) {
  for (const code of codes) test.info().annotations.push({ type: 'requirement', description: code });
}

/** «Повторить» после восстановления API. Экран может перезапросить данные и сам (фоновое обновление очереди) —
 *  тогда кнопка исчезает раньше клика; в обоих случаях дальше проверяется, что данные загрузились. */
async function retryAfterRecovery(errorBox) {
  try {
    await errorBox.getByRole('button', { name: 'Повторить' }).click({ timeout: 3_000 });
  } catch {
    await expect(errorBox).toHaveCount(0);
  }
}

function field(page, label) {
  return page.locator('.metadata > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
}

async function fillComplaint(page, { categoryId = 'cross_department', description, solution }) {
  await page.getByLabel('Тип обращения').selectOption('problem');
  await page.getByLabel('Категория', { exact: true }).selectOption(categoryId);
  await page.getByLabel('Описание', { exact: true }).fill(description);
  if (solution) await page.getByLabel(/Предлагаемое решение/).fill(solution);
}

async function submitComplaint(page, data) {
  await nav(page).getByRole('link', { name: 'Новое обращение' }).click();
  await fillComplaint(page, data);
  if (data.attachment) await page.getByLabel('Добавить тестовое вложение').check();
  await page.getByRole('button', { name: 'Отправить обращение' }).click();
  await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
  const number = (await page.locator('.registration-number').textContent())?.trim() ?? '';
  expect(number).toMatch(/^A-\d{3,}$/);
  return number;
}

async function openInQueue(page, number) {
  await nav(page).getByRole('link', { name: 'Очередь обращений' }).click();
  await page.getByLabel('Поиск по номеру или тексту').fill(number);
  await page.locator('.complaint-list').getByRole('link', { name: number, exact: true }).click();
  await expect(page.getByRole('heading', { name: `Обращение ${number}` })).toBeVisible();
}

async function dashboardTotals(page) {
  await nav(page).getByRole('link', { name: 'Дашборд' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Дашборд' })).toBeVisible();
  await expect(tile(page, 'dash-total')).toHaveText(/\d/);
  return { total: await numberOf(tile(page, 'dash-total')), open: await numberOf(tile(page, 'dash-open')) };
}

/** Запросы браузера за пределы локального стенда: в e2e их быть не должно (кроме явно заблокированных). */
function trackExternalRequests(page) {
  const external = [];
  page.on('request', request => {
    const { protocol, hostname } = new URL(request.url());
    if ((protocol === 'http:' || protocol === 'https:') && !localHosts.has(hostname)) external.push(request.url());
  });
  return external;
}

test.describe('итоговое состояние глазами трёх ролей', () => {
  test('R1-R7: подача → назначение → обсуждение → отказ → итог автора → история → дашборд и сводка', async ({ page }) => {
    requirements('R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7');
    const description = `[${run}] Заявки на приобретение приходят без параметров изделия.`;
    const fallbackText = `[${run}] Обращение без правила маршрутизации.`;
    const comment = `[${run}] Изучаем регламент, ответим до срока.`;
    const refusal = `[${run}] Отказ: параметры уже обязательны в новой версии шаблона.`;
    let number = '';
    let fallback = '';
    let before;

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Мои обращения' })).toBeVisible();

    await test.step('R7 (исходно): руководитель запоминает показатели дашборда', async () => {
      await switchRole(page, 'manager');
      before = await dashboardTotals(page);
      expect(before.total).toBeGreaterThan(0);
      await switchRole(page, 'employee');
    });

    await test.step('R1: сотрудник подаёт обращение и получает номер', async () => {
      number = await submitComplaint(page, { description, solution: 'Сделать параметры обязательными.', attachment: true });
      await page.getByRole('link', { name: 'Открыть обращение' }).click();
      await expectStatus(page, 'Новое');
      await expect(page.getByText(description)).toBeVisible();
      await expect(page.getByText('sample-request.txt')).toBeVisible();
    });

    await test.step('R2: автоназначение по категории и запасная очередь без правила', async () => {
      await expect(field(page, 'Ответственный')).toHaveText('Руководитель закупок');
      await expect(field(page, 'Срок')).not.toHaveText('');
      fallback = await submitComplaint(page, { categoryId: 'no_rule_demo', description: fallbackText });
      await expect(page.locator('.registration-meta')).toContainText('Ожидает назначения');
    });

    await test.step('R5: автор не видит панели обработки и очереди', async () => {
      await page.getByRole('link', { name: 'Открыть обращение' }).click();
      await expect(page.getByRole('heading', { name: `Обращение ${fallback}` })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Обработка обращения' })).toHaveCount(0);
      await expect(nav(page).getByRole('link', { name: 'Очередь обращений' })).toHaveCount(0);
    });

    await test.step('R2: руководитель видит обращение без правила в запасной очереди', async () => {
      await switchRole(page, 'manager');
      await nav(page).getByRole('link', { name: 'Очередь обращений' }).click();
      await page.locator('form.filter-form label').filter({ hasText: /^Очередь/ }).locator('select').selectOption('unassigned');
      await page.getByRole('button', { name: 'Применить фильтры' }).click();
      await expect(page.locator('.complaint-item').filter({ hasText: fallback })).toContainText('Без ответственного');
    });

    await test.step('R3, R5: руководитель начинает рассмотрение и комментирует; автор не аноним — имя видно', async () => {
      await openInQueue(page, number);
      await expect(field(page, 'Автор')).toContainText(authorName);
      await page.getByRole('button', { name: 'Начать рассмотрение' }).click();
      await expectStatus(page, 'На рассмотрении');
      await page.getByLabel('Комментарий или вопрос').fill(comment);
      await page.getByRole('button', { name: 'Добавить комментарий' }).click();
      await expect(page.locator('ul.timeline')).toContainText(comment);
      await expectStatus(page, 'На рассмотрении');
    });

    await test.step('R4: мотивированный отказ закрывает обработку', async () => {
      await page.getByLabel('Итог рассмотрения').selectOption('rejected');
      await page.getByLabel('Мотивированный отказ').fill(refusal);
      await page.getByRole('button', { name: 'Зафиксировать итог' }).click();
      await expectStatus(page, 'Отклонено');
      await expect(page.getByRole('heading', { name: 'Обработка обращения' })).toHaveCount(0);
    });

    await test.step('R6: история и фильтр по статусу находят закрытое обращение', async () => {
      const history = page.locator('ol.timeline > li');
      expect(await history.count()).toBeGreaterThanOrEqual(3);
      await nav(page).getByRole('link', { name: 'Очередь обращений' }).click();
      await page.getByRole('button', { name: 'Сбросить' }).click();
      await page.locator('form.filter-form label').filter({ hasText: /^Статус/ }).locator('select').selectOption('rejected');
      await page.getByRole('button', { name: 'Применить фильтры' }).click();
      await page.getByLabel('Поиск по номеру или тексту').fill(run);
      const item = page.locator('.complaint-item').filter({ hasText: number });
      await expect(item).toBeVisible();
      await expect(item.locator('.status-badge')).toHaveText('Отклонено');
      await expect(page.locator('.complaint-item').filter({ hasText: fallback })).toHaveCount(0);
    });

    await test.step('R4: автор видит итог в списке и объяснение в карточке', async () => {
      await switchRole(page, 'employee');
      await nav(page).getByRole('link', { name: 'Мои обращения' }).click();
      const item = page.locator('.complaint-list .complaint-item').filter({ hasText: number });
      await expect(item.locator('.status-badge')).toHaveText('Отклонено');
      await item.getByRole('link', { name: number, exact: true }).click();
      await expect(page.locator('.decision')).toContainText('Отклонено');
      await expect(page.locator('.decision')).toContainText(refusal);
      await expect(page.locator('ul.timeline')).toContainText(comment);
    });

    await test.step('R7: дашборд руководителя учёл оба новых обращения', async () => {
      await switchRole(page, 'manager');
      const after = await dashboardTotals(page);
      expect(after.total).toBe(before.total + 2);
      // Новое обращение без правила остаётся открытым, отклонённое — закрыто.
      expect(after.open).toBe(before.open + 1);
    });

    await test.step('R7: сводка администратора показывает итоги и проценты', async () => {
      await switchRole(page, 'admin');
      await expect(page.getByRole('heading', { level: 1, name: 'Сводка' })).toBeVisible();
      await expect(tile(page, 'summary-total')).toHaveText(/\d/);
      expect(await numberOf(tile(page, 'summary-total'))).toBeGreaterThanOrEqual(before.total + 2);
      await expect(tile(page, 'summary-closed')).toHaveText(/%/);
      await expect(page.getByRole('table', { name: 'Повторяющиеся темы' })).toBeVisible();
    });
  });
});

test.describe('ошибки и восстановление', () => {
  test('ошибочный ввод: подсказки у полей, запрос не уходит, исправление снимает ошибки', async ({ page }) => {
    requirements('R1', 'R10');
    const posts = [];
    page.on('request', request => { if (isComplaintPost(request)) posts.push(request.url()); });
    await page.goto('/submit');
    await page.getByRole('button', { name: 'Отправить обращение' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Выберите категорию.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Опишите проблему или предложение.' })).toBeVisible();
    await expect(page.locator('#category')).toBeFocused();
    await expect(page.locator('#category')).toHaveAttribute('aria-invalid', 'true');
    // Пробелы вместо описания — тоже пустое описание.
    await page.getByLabel('Категория', { exact: true }).selectOption('cross_department');
    await page.getByLabel('Описание', { exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Отправить обращение' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Опишите проблему или предложение.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Выберите категорию.' })).toHaveCount(0);
    await page.getByLabel('Описание', { exact: true }).fill(`[${run}] Исправленное описание.`);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(posts, 'неверная форма не отправляется на сервер').toEqual([]);
  });

  test('API недоступен при подаче: понятная ошибка, данные формы на месте, повтор создаёт одно обращение даже при двойном клике', async ({ page }) => {
    requirements('R1', 'R10');
    const description = `[${run}] Нет связи при подаче: текст должен сохраниться.`;
    const solution = 'Повторить отправку после восстановления.';
    const created = [];
    page.on('response', response => { if (isComplaintPost(response.request()) && response.status() === 201) created.push(response.url()); });
    await page.goto('/submit');
    await fillComplaint(page, { description, solution });

    await page.route('**/api/complaints', route => route.request().method() === 'POST' ? route.abort('connectionrefused') : route.fallback());
    await page.getByRole('button', { name: 'Отправить обращение' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Нет связи с сервером' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toHaveCount(0);
    await expect(page.getByLabel('Описание', { exact: true })).toHaveValue(description);
    await expect(page.getByLabel(/Предлагаемое решение/)).toHaveValue(solution);
    await expect(page.getByLabel('Категория', { exact: true })).toHaveValue('cross_department');

    // Сервер отвечает 500: сообщение без технических подробностей, данные снова на месте.
    await page.unroute('**/api/complaints');
    await page.route('**/api/complaints', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Internal Server Error</h1>' }) : route.fallback());
    await page.getByRole('button', { name: 'Отправить обращение' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Сервер временно недоступен' })).toBeVisible();
    await expect(page.getByText('Internal Server Error')).toHaveCount(0);
    await expect(page.getByLabel('Описание', { exact: true })).toHaveValue(description);

    await page.unroute('**/api/complaints');
    await page.getByRole('button', { name: 'Отправить обращение' }).dblclick();
    await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
    // Даём второму клику шанс уйти на сервер, затем проверяем, что обращение одно.
    await page.waitForTimeout(500);
    expect(created).toHaveLength(1);
    const response = await page.request.get(`/api/complaints?q=${encodeURIComponent(run)}&limit=100`, { headers: { 'X-Demo-User': 'manager-1' } });
    expect(response.ok()).toBe(true);
    const matches = (await response.json()).items.filter(item => item.description === description);
    expect(matches, 'повторный клик не дублирует обращение').toHaveLength(1);
  });

  test('слишком частые запросы (429): обратный отсчёт блокирует кнопку, данные не теряются', async ({ page }) => {
    requirements('R10');
    const description = `[${run}] Лимит запросов: текст должен сохраниться.`;
    await page.goto('/submit');
    await fillComplaint(page, { description });
    await page.route('**/api/complaints', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, contentType: 'application/json', body: JSON.stringify({ code: 'RATE_LIMITED', message: 'Слишком много запросов записи.' }) })
      : route.fallback());
    const submit = page.getByRole('button', { name: 'Отправить обращение' });
    await submit.click();
    await expect(page.getByRole('alert').filter({ hasText: /Слишком много запросов, повторите через \d с/ })).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(page.getByLabel('Описание', { exact: true })).toHaveValue(description);
    await expect(submit).toBeEnabled({ timeout: 5_000 });
    await page.unroute('**/api/complaints');
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
  });

  test('API недоступен при загрузке очереди, дашборда и сводки: сообщение и «Повторить» восстанавливают экран', async ({ page }) => {
    requirements('R6', 'R7', 'R10');
    await page.goto('/');
    await switchRole(page, 'manager');
    await expect(page.getByRole('heading', { level: 1, name: 'Очередь обращений' })).toBeVisible();

    await page.route('**/api/complaints?**', route => route.abort('connectionrefused'));
    await nav(page).getByRole('link', { name: 'Дашборд' }).click();
    await nav(page).getByRole('link', { name: 'Очередь обращений' }).click();
    const queueError = page.locator('.load-error').filter({ hasText: 'Нет связи с сервером' });
    await expect(queueError).toBeVisible();
    await page.unroute('**/api/complaints?**');
    await retryAfterRecovery(queueError);
    await expect(page.locator('.complaint-list .complaint-item').first()).toBeVisible();
    await expect(page.locator('.load-error')).toHaveCount(0);

    await page.route('**/api/analytics/trends**', route => route.fulfill({ status: 503, body: 'upstream down' }));
    await nav(page).getByRole('link', { name: 'Дашборд' }).click();
    const dashError = page.locator('.load-error').filter({ hasText: 'Сервер временно недоступен' });
    await expect(dashError).toBeVisible();
    await expect(page.getByText('upstream down')).toHaveCount(0);
    await page.unroute('**/api/analytics/trends**');
    await retryAfterRecovery(dashError);
    await expect(tile(page, 'dash-total')).toHaveText(/\d/);

    await switchRole(page, 'admin');
    await page.route('**/api/summary', route => route.abort('connectionrefused'));
    await nav(page).getByRole('link', { name: 'Дашборд' }).click();
    await nav(page).getByRole('link', { name: 'Сводка' }).click();
    const summaryError = page.locator('.load-error').filter({ hasText: 'Нет связи с сервером' });
    await expect(summaryError).toBeVisible();
    await page.unroute('**/api/summary');
    await retryAfterRecovery(summaryError);
    await expect(tile(page, 'summary-total')).toHaveText(/\d/);
  });

  test('пустой результат поиска: объяснение и сброс возвращают очередь', async ({ page }) => {
    requirements('R6', 'R10');
    await page.goto('/');
    await switchRole(page, 'manager');
    const query = `нет-такого-${run}`;
    await page.getByLabel('Поиск по номеру или тексту').fill(query);
    const empty = page.locator('.empty-state');
    await expect(empty).toContainText(`По запросу «${query}» обращений нет.`);
    await expect(page.getByText(/^Найдено: 0/)).toBeVisible();
    await empty.getByRole('button', { name: 'Сбросить поиск' }).click();
    await expect(page.getByLabel('Поиск по номеру или тексту')).toHaveValue('');
    await expect(page.locator('.complaint-list .complaint-item').first()).toBeVisible();

    await page.locator('form.filter-form label').filter({ hasText: /^Категория/ }).locator('select').selectOption('no_rule_demo');
    await page.locator('form.filter-form label').filter({ hasText: /^Статус/ }).locator('select').selectOption('implemented');
    await page.getByRole('button', { name: 'Применить фильтры' }).click();
    await expect(empty).toContainText('По выбранным фильтрам обращений нет.');
    await empty.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await expect(page.locator('.complaint-list .complaint-item').first()).toBeVisible();
  });

  // Дефект из #301 (отчёт final-regression.md): при уходе с формы подачи по меню текст пропадал.
  // Исправлено черновиком в sessionStorage (#312 A2).
  test('уход с заполненной формы подачи предупреждает или сохраняет черновик', async ({ page }) => {
    requirements('R1', 'R10');
    const description = `[${run}] Черновик не должен пропасть молча.`;
    await page.goto('/submit');
    await fillComplaint(page, { description });
    let warned = false;
    page.on('dialog', dialog => { warned = true; return dialog.dismiss(); });
    await nav(page).getByRole('link', { name: 'Мои обращения' }).click();
    if (!warned) {
      await nav(page).getByRole('link', { name: 'Новое обращение' }).click();
      await expect(page.getByLabel('Описание', { exact: true })).toHaveValue(description);
    }
  });
});

test.describe('ИИ без ключа Anthropic и без внешней сети', () => {
  test('подсказка категории работает локально, источник честный, подача не зависит от ИИ', async ({ page }) => {
    requirements('R1', 'R12');
    await page.route(/api\.anthropic\.com/, route => route.abort('blockedbyclient'));
    const external = trackExternalRequests(page);
    await page.goto('/submit');
    await page.getByLabel('Описание', { exact: true }).fill(`[${run}] В заявках на приобретение не хватает параметров изделия.`);
    const suggestion = page.waitForResponse(response => response.url().includes('/api/complaints/suggest-category'));
    await page.getByRole('button', { name: 'Подсказать категорию' }).click();
    const response = await suggestion;
    expect(response.status()).toBe(200);
    const body = await response.json();
    // contracts/api.yaml CategorySuggestion.source: без ключа допустимы demo-fixture, rules или none, но не llm.
    expect(['demo-fixture', 'rules', 'none']).toContain(body.source);
    const note = page.getByRole('status', { name: 'Подсказка категории' });
    if (body.category) {
      await expect(note).toContainText(body.source === 'rules' ? 'Правила (без ИИ)' : 'Демо ИИ');
      await expect(page.getByLabel('Категория', { exact: true })).toHaveValue(body.category.id);
    } else {
      await expect(note).toContainText('Подходящей категории не нашлось');
      await page.getByLabel('Категория', { exact: true }).selectOption('cross_department');
    }
    await expect(note).not.toContainText(/^ИИ\b/);
    await page.getByRole('button', { name: 'Отправить обращение' }).click();
    await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
    expect(external, 'браузер не обращается к внешним сервисам').toEqual([]);
  });

  test('сбой подсказки не мешает подать обращение', async ({ page }) => {
    requirements('R1', 'R12');
    await page.route('**/api/complaints/suggest-category**', route => route.abort('connectionrefused'));
    await page.goto('/submit');
    await page.getByLabel('Описание', { exact: true }).fill(`[${run}] Подсказка упала, но подача работает.`);
    await page.getByRole('button', { name: 'Подсказать категорию' }).click();
    await expect(page.getByRole('status', { name: 'Подсказка категории' })).toContainText('Подсказка сейчас недоступна, выберите категорию вручную.');
    await page.getByLabel('Категория', { exact: true }).selectOption('cross_department');
    await page.getByRole('button', { name: 'Отправить обращение' }).click();
    await expect(page.getByRole('heading', { name: 'Обращение зарегистрировано' })).toBeVisible();
  });

  for (const role of ['manager', 'admin']) {
    test(`${role}: недельная сводка — шаблон без ИИ, тренды по контракту, сбой сводки не ломает дашборд`, async ({ page }) => {
      requirements('R7', 'R12');
      await page.route(/api\.anthropic\.com/, route => route.abort('blockedbyclient'));
      const external = trackExternalRequests(page);
      await page.goto('/');
      await switchRole(page, role);
      const digest = page.waitForResponse(response => new URL(response.url()).pathname === '/api/summary/digest');
      const trends = page.waitForResponse(response => new URL(response.url()).pathname === '/api/analytics/trends');
      await nav(page).getByRole('link', { name: 'Дашборд' }).click();
      const [digestResponse, trendsResponse] = await Promise.all([digest, trends]);
      expect(digestResponse.status()).toBe(200);
      // contracts/api.yaml Digest.source: без ключа — только template.
      expect((await digestResponse.json()).source).toBe('template');
      expect(trendsResponse.status()).toBe(200);
      const trendsBody = await trendsResponse.json();
      // У analytics/trends поля source в контракте нет: проверяем только форму ответа.
      expect(trendsBody.totals).toEqual(expect.objectContaining({ total: expect.any(Number), openCount: expect.any(Number) }));
      expect(Array.isArray(trendsBody.byDay)).toBe(true);
      const panel = page.locator('.weekly-digest');
      await expect(panel).toContainText('Шаблон (без ИИ)');
      await expect(panel.locator('.digest-text')).not.toBeEmpty();

      await page.route('**/api/summary/digest**', route => route.abort('connectionrefused'));
      await panel.getByRole('button', { name: 'Обновить сводку за неделю' }).click();
      await expect(panel.locator('.load-error')).toContainText('Нет связи с сервером');
      await expect(tile(page, 'dash-total')).toHaveText(/\d/);
      await page.unroute('**/api/summary/digest**');
      await panel.getByRole('button', { name: 'Повторить' }).click();
      await expect(panel).toContainText('Шаблон (без ИИ)');
      expect(external, 'браузер не обращается к внешним сервисам').toEqual([]);
    });
  }
});

test.describe('console и network на основном пути', () => {
  test('экраны трёх ролей без ошибок console, исключений и неожиданных ответов 4xx/5xx', async ({ page }) => {
    requirements('R10', 'R12');
    const problems = [];
    page.on('console', message => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    page.on('requestfailed', request => problems.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`); });
    const external = trackExternalRequests(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Мои обращения' })).toBeVisible();
    await page.locator('.complaint-list .complaint-number').first().click();
    await expect(page.getByRole('heading', { level: 1, name: /^Обращение / })).toBeVisible();
    await nav(page).getByRole('link', { name: 'Новое обращение' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Новое обращение' })).toBeVisible();
    await page.getByLabel('Описание', { exact: true }).fill(`[${run}] Проверка ошибок консоли на форме.`);
    await page.waitForResponse(response => response.url().includes('/api/complaints/similar'));

    await switchRole(page, 'manager');
    await expect(page.getByRole('heading', { level: 1, name: 'Очередь обращений' })).toBeVisible();
    await page.locator('.complaint-list .complaint-number').first().click();
    await expect(page.getByRole('heading', { level: 1, name: /^Обращение / })).toBeVisible();
    await nav(page).getByRole('link', { name: 'Дашборд' }).click();
    await expect(page.locator('.weekly-digest')).toContainText('Шаблон (без ИИ)');

    await switchRole(page, 'admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Сводка' })).toBeVisible();
    await expect(tile(page, 'summary-total')).toHaveText(/\d/);
    await nav(page).getByRole('link', { name: 'Дашборд' }).click();
    await expect(page.locator('.weekly-digest')).toContainText('Шаблон (без ИИ)');

    // Классификация: ожидаемые ошибки основного пути отсутствуют. Ожидаемые отказы (перевод 503 без ключа,
    // заблокированные тайлы карты) проверяются отдельно в ux-release.spec.mjs и сюда не попадают.
    expect(problems).toEqual([]);
    expect(external).toEqual([]);
  });
});

test.describe('адаптивность дашборда и шапки (R10)', () => {
  for (const width of [360, 768, 1280]) {
    test(`дашборд руководителя и администратора и шапка без скролла и перекрытий на ${width} px`, async ({ page }) => {
      requirements('R7', 'R10');
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      for (const role of ['manager', 'admin']) {
        await switchRole(page, role);
        await nav(page).getByRole('link', { name: 'Дашборд' }).click();
        await expect(tile(page, 'dash-total')).toHaveText(/\d/);
        await expect(page.locator('.weekly-digest')).toContainText('Шаблон (без ИИ)');
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        expect(size.scroll, `${role} ${width}px: горизонтальный скролл`).toBeLessThanOrEqual(size.inner);
      }
      // Все элементы управления шапки видимы, в пределах экрана и не перекрывают друг друга.
      const controls = page.locator('header.app-header select, header.app-header a, footer.demo-controls select, footer.demo-controls a, footer.demo-controls input');
      const boxes = [];
      for (const control of await controls.all()) {
        if (!(await control.isVisible())) continue;
        const box = await control.boundingBox();
        boxes.push({ name: (await control.getAttribute('aria-label')) ?? (await control.textContent())?.trim().slice(0, 20), ...box });
      }
      expect(boxes.length).toBeGreaterThanOrEqual(4);
      for (const box of boxes) {
        expect(box.x, `${box.name}: левый край`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${box.name}: правый край`).toBeLessThanOrEqual(width + 0.5);
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const [a, b] = [boxes[i], boxes[j]];
          const overlap = a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
          expect(overlap, `${width}px: «${a.name}» перекрывает «${b.name}»`).toBe(false);
        }
      }
    });
  }
});
