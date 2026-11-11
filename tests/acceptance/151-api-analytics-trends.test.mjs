import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false });
requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8')), 'contract');
const validTrends = ajv.compile({ $ref: 'contract#/components/schemas/AnalyticsTrends' });
const validError = ajv.compile({ $ref: 'contract#/components/schemas/Error' });
const instant = new Date('2026-11-10T12:00:00Z'); // Tuesday; current Monday is 2026-11-09
const DAY = 86400000;

function setup(t) {
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  const previous = process.env.PERSIST_FILE;
  delete process.env.PERSIST_FILE;
  t.after(() => previous === undefined ? delete process.env.PERSIST_FILE : process.env.PERSIST_FILE = previous);
  const app = buildApp();
  t.after(() => app.close());
  return app;
}
async function trends(app, query = '', user = 'manager-1') {
  const response = await app.inject({ url: '/analytics/trends' + query, headers: user ? { 'x-demo-user': user } : {} });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.ok(validTrends(body), JSON.stringify(validTrends.errors));
  return body;
}
const day = iso => iso.slice(0, 10);
function make(sample, index, changes) {
  return { ...structuredClone(sample), id: `trend-${index}`, number: `A-${200 + index}`, departmentId: 'procurement',
    categoryId: 'training', createdAt: '2026-11-10T00:00:00Z', dueAt: '2026-11-20T00:00:00Z', status: 'new',
    description: 'Обычный текст', proposedSolution: null, firstResponseAt: null, closedAt: null, overdue: false, ...changes };
}

test('#151 manager и admin получают снимок, employee и аноним нет', async t => {
  const app = setup(t);
  for (const user of ['manager-1', 'admin-1']) {
    const body = await trends(app, '', user);
    assert.equal(body.generatedAt, instant.toISOString());
  }
  const forbidden = await app.inject({ url: '/analytics/trends', headers: { 'x-demo-user': 'employee-1' } });
  assert.equal(forbidden.statusCode, 403);
  assert.ok(validError(forbidden.json()));
  const anonymous = await app.inject({ url: '/analytics/trends' });
  assert.equal(anonymous.statusCode, 401);
  const unknown = await app.inject({ url: '/analytics/trends?foo=1', headers: { 'x-demo-user': 'manager-1' } });
  assert.ok([400, 422].includes(unknown.statusCode));
  const bad = await app.inject({ url: '/analytics/trends?department=a%20b', headers: { 'x-demo-user': 'manager-1' } });
  assert.ok([400, 422].includes(bad.statusCode));
});

test('#151 seed: числа совпадают с независимым пересчётом', async t => {
  const app = setup(t);
  const items = app.store.list();
  const body = await trends(app);
  const terminal = new Set(['implemented', 'rejected', 'closed']);
  // Ручной пересчёт без кода реализации.
  const expectedDays = [];
  for (let i = 13; i >= 0; i--) {
    const date = day(new Date(instant.getTime() - i * DAY).toISOString());
    expectedDays.push({ date, count: items.filter(item => day(item.createdAt) === date && Date.parse(item.createdAt) <= instant.getTime()).length });
  }
  assert.deepEqual(body.byDay, expectedDays);
  assert.equal(body.byWeek.length, 8);
  assert.equal(body.byWeek.at(-1).weekStart, '2026-11-09');
  assert.equal(body.byWeek[0].weekStart, '2026-09-21');
  for (const week of body.byWeek) {
    const start = Date.parse(week.weekStart), end = Math.min(start + 7 * DAY, instant.getTime() + 1);
    assert.equal(week.count, items.filter(item => Date.parse(item.createdAt) >= start && Date.parse(item.createdAt) < end).length);
  }
  const counts = {};
  for (const item of items) counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
  const expectedCategories = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  assert.deepEqual(body.byCategory.map(item => [item.categoryId, item.count]), expectedCategories);
  for (const item of body.byCategory) {
    assert.equal(item.categoryName, app.store.referenceData.categories.find(category => category.id === item.categoryId).name);
  }
  const overdue = items.filter(item => !terminal.has(item.status) && Date.parse(item.dueAt) < instant.getTime());
  assert.equal(body.overdue.length, overdue.length);
  assert.deepEqual(new Set(body.overdue.map(item => item.number)), new Set(overdue.map(item => item.number)));
  for (const row of body.overdue) {
    const source = items.find(item => item.number === row.number);
    assert.equal(row.categoryId, source.categoryId);
    assert.equal(row.dueAt, source.dueAt);
    assert.ok(Math.abs(row.overdueHours - (instant.getTime() - Date.parse(source.dueAt)) / 3600000) < 1e-9);
  }
  for (let i = 1; i < body.overdue.length; i++) assert.ok(body.overdue[i - 1].overdueHours >= body.overdue[i].overdueHours);
  assert.equal(body.totals.total, 20);
  assert.equal(body.totals.closedCount, items.filter(item => terminal.has(item.status)).length);
  assert.equal(body.totals.openCount, body.totals.total - body.totals.closedCount);
  assert.equal(body.totals.overdueCount, overdue.length);
  assert.equal(body.topThemes.length, 5);
  assert.deepEqual(body.byDepartment.map(item => item.departmentId), body.byDepartment.map(item => item.departmentId).sort());
  assert.equal(body.byDepartment.reduce((sum, item) => sum + item.count, 0), 20);
});

test('#151 графики нулями заполняют пустые дни и недели; границы суток и недели', async t => {
  const app = setup(t), sample = app.store.list()[0];
  const records = [
    make(sample, 1, { createdAt: '2026-11-10T00:00:00Z' }),
    make(sample, 2, { createdAt: '2026-11-09T23:59:59Z' }),
    make(sample, 3, { createdAt: '2026-10-28T00:00:00Z' }), // первый из 14 дней
    make(sample, 4, { createdAt: '2026-10-27T23:59:59Z' }), // вне окна дней, но внутри недели 10-26
    make(sample, 5, { createdAt: '2026-09-21T00:00:00Z' }), // первая из 8 недель
    make(sample, 6, { createdAt: '2026-09-20T23:59:59Z' }), // вне окна недель
    make(sample, 7, { createdAt: '2026-11-10T12:00:01Z' }), // позже generatedAt
  ];
  t.mock.method(app.store, 'list', () => records);
  const body = await trends(app);
  assert.equal(body.byDay.length, 14);
  assert.equal(body.byDay[0].date, '2026-10-28');
  assert.equal(body.byDay[13].date, '2026-11-10');
  const byDay = Object.fromEntries(body.byDay.map(item => [item.date, item.count]));
  assert.equal(byDay['2026-11-10'], 1);
  assert.equal(byDay['2026-11-09'], 1);
  assert.equal(byDay['2026-10-28'], 1);
  assert.equal(byDay['2026-11-05'], 0);
  assert.equal(body.byDay.reduce((sum, item) => sum + item.count, 0), 3);
  assert.deepEqual(body.byWeek.map(item => item.weekStart), [
    '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
  assert.deepEqual(body.byWeek.map(item => item.count), [1, 0, 0, 0, 0, 2, 1, 2]);
});

test('#151 topThemes: стоп-слова, один раз на обращение, минимум два обращения, тай-брейк по алфавиту', async t => {
  const app = setup(t), sample = app.store.list()[0];
  const records = [
    make(sample, 1, { description: 'Принтер и принтер в кабинете не работает, ёлка', proposedSolution: 'Заменить картридж' }),
    make(sample, 2, { description: 'Принтер на этаже, картридж пуст. Ёлка!' }),
    make(sample, 3, { description: 'Картридж закончился в кабинете', proposedSolution: 'Купить ЕЛКА' }),
    make(sample, 4, { description: 'Единственное слово уникальноеслово' }),
    make(sample, 5, { description: 'Сервер сервер сервер', proposedSolution: null }),
  ];
  t.mock.method(app.store, 'list', () => records);
  const body = await trends(app);
  // принтер: 1,2 (2); картридж: 1,2,3 (3); ёлка/елка: 1,2,3 (3); кабинете: 1,3 (2); сервер: только 5 -> не повтор.
  assert.deepEqual(body.topThemes.slice(0, 2), [{ theme: 'картридж', count: 3 }, { theme: 'елка', count: 3 }]);
  const themes = body.topThemes.map(item => item.theme);
  assert.ok(themes.includes('принтер') && themes.includes('кабинете'));
  assert.ok(!themes.includes('сервер'), 'слово из одного обращения не тема');
  assert.ok(!themes.includes('уникальноеслово'));
  for (const stop of ['и', 'в', 'не', 'на']) assert.ok(!themes.includes(stop), `стоп-слово ${stop}`);
  assert.ok(body.topThemes.every(item => item.count >= 2));
  for (let i = 1; i < body.topThemes.length; i++) {
    const a = body.topThemes[i - 1], b = body.topThemes[i];
    assert.ok(a.count > b.count || (a.count === b.count && a.theme < b.theme));
  }
});

test('#151 topThemes ограничен пятью темами', async t => {
  const app = setup(t), sample = app.store.list()[0];
  const words = ['альфа', 'бета', 'гамма', 'дельта', 'эпсилон', 'зета', 'эта'];
  const records = [1, 2].map(index => make(sample, index, { description: words.join(' ') }));
  t.mock.method(app.store, 'list', () => records);
  const body = await trends(app);
  assert.deepEqual(body.topThemes.map(item => item.theme), ['альфа', 'бета', 'гамма', 'дельта', 'зета']);
});

test('#151 просрочка: только незавершённые, включая неназначенные, граница строгая', async t => {
  const app = setup(t), sample = app.store.list()[0];
  const records = [
    make(sample, 1, { dueAt: '2026-11-10T10:00:00Z' }), // 2 часа
    make(sample, 2, { dueAt: '2026-11-09T12:00:00Z', assignee: null, routing: { queue: 'unassigned', reason: 'no_rule' }, categoryId: 'it' }), // 24 часа
    make(sample, 3, { dueAt: '2026-11-01T00:00:00Z', status: 'closed', closedAt: '2026-11-05T00:00:00Z' }),
    make(sample, 4, { dueAt: instant.toISOString() }), // ровно сейчас: не просрочено
    make(sample, 5, { dueAt: '2026-11-10T11:30:00Z', overdue: false }), // 0.5 часа
  ];
  t.mock.method(app.store, 'list', () => records);
  const body = await trends(app);
  assert.deepEqual(body.overdue.map(item => [item.number, item.overdueHours]), [['A-202', 24], ['A-201', 2], ['A-205', 0.5]]);
  assert.equal(body.overdue[0].categoryId, 'it');
  assert.equal(body.overdue[0].categoryName, app.store.referenceData.categories.find(category => category.id === 'it').name);
  assert.equal(body.totals.overdueCount, 3);
  assert.equal(body.totals.total, 5);
  assert.equal(body.totals.closedCount, 1);
  assert.equal(body.totals.openCount, 4);
  assert.equal(body.totals.averageResolutionHours, 96);
});

test('#151 фильтр department применяется ко всем блокам', async t => {
  const app = setup(t), sample = app.store.list()[0];
  const records = [
    make(sample, 1, { departmentId: 'procurement', categoryId: 'training', description: 'серверная стойка', dueAt: '2026-11-09T12:00:00Z' }),
    make(sample, 2, { departmentId: 'procurement', categoryId: 'training', description: 'серверная стойка' }),
    make(sample, 3, { departmentId: 'engineering', categoryId: 'it', description: 'принтер принтер', dueAt: '2026-11-01T00:00:00Z' }),
    make(sample, 4, { departmentId: 'engineering', categoryId: 'it', description: 'принтер', status: 'closed', closedAt: '2026-11-10T06:00:00Z' }),
  ];
  t.mock.method(app.store, 'list', () => records);
  const all = await trends(app);
  assert.equal(all.totals.total, 4);
  const procurement = await trends(app, '?department=procurement');
  assert.equal(procurement.totals.total, 2);
  assert.equal(procurement.byDay.reduce((sum, item) => sum + item.count, 0), 2);
  assert.equal(procurement.byWeek.reduce((sum, item) => sum + item.count, 0), 2);
  assert.deepEqual(procurement.byCategory.map(item => [item.categoryId, item.count]), [['training', 2]]);
  assert.deepEqual(procurement.byDepartment.map(item => item.departmentId), ['procurement']);
  assert.deepEqual(procurement.topThemes.map(item => item.theme), ['серверная', 'стойка']);
  assert.deepEqual(procurement.overdue.map(item => item.number), ['A-201']);
  assert.equal(procurement.totals.overdueCount, 1);
  const engineering = await trends(app, '?department=engineering');
  assert.deepEqual(engineering.topThemes.map(item => item.theme), ['принтер']);
  assert.equal(engineering.totals.closedCount, 1);
  assert.equal(engineering.totals.averageResolutionHours, 6);
  // Неизвестный, но допустимый идентификатор даёт пустой результат.
  const unknown = await trends(app, '?department=nowhere');
  assert.equal(unknown.totals.total, 0);
  assert.deepEqual(unknown.byCategory, []);
  assert.equal(unknown.byDay.length, 14);
});

test('#151 пустое хранилище: нулевые корзины, пустые массивы, нули и null', async t => {
  const app = setup(t);
  t.mock.method(app.store, 'list', () => []);
  const body = await trends(app);
  assert.equal(body.byDay.length, 14);
  assert.equal(body.byWeek.length, 8);
  assert.ok(body.byDay.every(item => item.count === 0));
  assert.ok(body.byWeek.every(item => item.count === 0));
  for (const key of ['byCategory', 'byDepartment', 'topThemes', 'overdue']) assert.deepEqual(body[key], [], key);
  assert.deepEqual(body.totals, { total: 0, openCount: 0, closedCount: 0, overdueCount: 0, averageResolutionHours: null });
});

test('#151 автор анонимных обращений не раскрывается и данные не мутируются', async t => {
  const app = setup(t);
  const items = app.store.list();
  const before = structuredClone(items);
  const text = JSON.stringify(await trends(app));
  for (const item of items) {
    assert.ok(!text.includes(item.author.id), item.author.id);
    assert.ok(!text.includes(item.author.name), item.author.name);
    assert.ok(!text.includes(item.description), 'текст обращения не возвращается');
  }
  assert.ok(!/"author"/.test(text));
  assert.deepEqual(app.store.list(), before);
});
