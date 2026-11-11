// #215: SEED_RELATIVE_DATES=1 привязывает даты seed-обращений к «сегодня».
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';
import { seedComplaints } from '../dist/seed.js';

const DAY = 86_400_000;
const terminal = ['implemented', 'rejected', 'closed'];

function withFlag(t, value) {
  const previous = process.env.SEED_RELATIVE_DATES;
  t.after(() => previous === undefined ? delete process.env.SEED_RELATIVE_DATES : process.env.SEED_RELATIVE_DATES = previous);
  if (value === undefined) delete process.env.SEED_RELATIVE_DATES;
  else process.env.SEED_RELATIVE_DATES = value;
}

function seedAt(t, iso) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(iso) });
  const items = seedComplaints();
  t.mock.timers.reset();
  return items;
}

/** Проверки критериев 1 и 2 для одного «сейчас». */
function assertRelative(items, nowIso) {
  const now = Date.parse(nowIso);
  assert.equal(items.length, 20);
  assert.deepEqual(items.map(item => item.number), items.map((_, index) => `A-${String(index + 1).padStart(3, '0')}`));
  let previous = -Infinity;
  for (const item of items) {
    const created = Date.parse(item.createdAt);
    assert.ok(created <= now && created >= now - 10 * DAY, `${item.number}: createdAt ${item.createdAt} вне окна 10 суток от ${nowIso}`);
    assert.ok(created > previous, `${item.number}: порядок по номеру нарушен`);
    previous = created;
    for (const key of ['updatedAt', 'firstResponseAt', 'closedAt']) {
      if (item[key] === null) continue;
      assert.ok(Date.parse(item[key]) >= created, `${item.number}: ${key} раньше createdAt`);
      assert.ok(Date.parse(item[key]) <= now, `${item.number}: ${key} в будущем`);
    }
    assert.equal(item.firstResponseAt === null, item.status === 'new', `${item.number}: первый ответ только у не новых`);
    assert.equal(item.closedAt !== null, terminal.includes(item.status), `${item.number}: closedAt только у завершённых`);
    assert.equal(Date.parse(item.history[0].createdAt), created);
    if (item.decision) assert.equal(item.decision.createdAt, item.closedAt);
    for (const comment of item.comments) assert.ok(Date.parse(comment.createdAt) >= created);
  }
  const open = items.filter(item => !terminal.includes(item.status));
  const overdue = open.filter(item => Date.parse(item.dueAt) < now);
  assert.ok(overdue.length >= 3 && overdue.length <= 5, `просрочено ${overdue.length}, нужно 3–5`);
  for (const item of open) {
    if (!overdue.includes(item)) assert.ok(Date.parse(item.dueAt) > now, `${item.number}: срок должен быть в будущем`);
  }
  return overdue.map(item => item.number);
}

test('SEED_RELATIVE_DATES=1: даты в окне 10 суток, порядок сохранён, просрочено 3–5 открытых', t => {
  withFlag(t, '1');
  // Проверяем разное время суток: сразу после полуночи, днём и перед полуночью.
  for (const now of ['2026-11-13T00:00:30.000Z', '2026-11-13T07:30:00.000Z', '2026-11-13T23:59:30.000Z']) {
    assertRelative(seedAt(t, now), now);
  }
});

test('SEED_RELATIVE_DATES=1: другое «сегодня» даёт те же данные со сдвигом', t => {
  withFlag(t, '1');
  const first = seedAt(t, '2026-11-13T07:30:00.000Z');
  const second = seedAt(t, '2026-12-24T07:30:00.000Z');
  const shift = Date.parse('2026-12-24T07:30:00.000Z') - Date.parse('2026-11-13T07:30:00.000Z');
  assert.deepEqual(assertRelative(first, '2026-11-13T07:30:00.000Z'), assertRelative(second, '2026-12-24T07:30:00.000Z'));
  const unshift = value => value === null ? null : new Date(Date.parse(value) - shift).toISOString();
  const normalized = structuredClone(second);
  for (const item of normalized) {
    for (const key of ['createdAt', 'updatedAt', 'dueAt', 'firstResponseAt', 'closedAt']) item[key] = unshift(item[key]);
    for (const event of item.history) event.createdAt = unshift(event.createdAt);
    for (const comment of item.comments) comment.createdAt = unshift(comment.createdAt);
    if (item.decision) item.decision.createdAt = unshift(item.decision.createdAt);
  }
  assert.deepEqual(normalized, first);
  // Сброс демо в другой день пересчитывает даты от нового «сегодня».
  assert.notEqual(first[0].createdAt, second[0].createdAt);
});

test('SEED_RELATIVE_DATES=1: время первой реакции разное, а не одинаковый час', t => {
  withFlag(t, '1');
  const items = seedAt(t, '2026-11-13T07:30:00.000Z').filter(item => item.firstResponseAt);
  const hours = new Set(items.map(item => (Date.parse(item.firstResponseAt) - Date.parse(item.createdAt)) / 3_600_000));
  assert.ok(hours.size >= 3, `разных интервалов первой реакции: ${hours.size}`);
});

test('без SEED_RELATIVE_DATES (и при значении не «1») даты seed прежние фиксированные', t => {
  for (const value of [undefined, '', '0', 'true']) {
    withFlag(t, value);
    const items = seedAt(t, '2026-11-13T07:30:00.000Z');
    assert.equal(items[0].createdAt, '2026-11-01T09:00:00.000Z');
    assert.equal(items[19].createdAt, '2026-11-01T09:19:00.000Z');
    assert.equal(items[0].dueAt, '2026-11-08T09:00:00.000Z');
    assert.equal(items[1].firstResponseAt, '2026-11-01T10:01:00.000Z');
    assert.equal(items[3].closedAt, '2026-11-02T09:03:00.000Z');
    assert.equal(items[0].firstResponseAt, null);
  }
});

test('SEED_RELATIVE_DATES=1: /summary показывает просроченные и среднее время первой реакции без NaN', async t => {
  withFlag(t, '1');
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/summary', headers: { 'x-demo-user': 'admin-1' } });
  assert.equal(response.statusCode, 200, response.body);
  const summary = response.json();
  assert.ok(summary.overdueCount >= 3 && summary.overdueCount <= 5, `overdueCount=${summary.overdueCount}`);
  assert.equal(typeof summary.averageFirstResponseHours, 'number');
  assert.ok(Number.isFinite(summary.averageFirstResponseHours) && summary.averageFirstResponseHours > 0);

  const list = await app.inject({ method: 'GET', url: '/complaints?overdue=true', headers: { 'x-demo-user': 'manager-1' } });
  assert.equal(list.statusCode, 200, list.body);
  const overdue = list.json().items;
  assert.equal(overdue.length, summary.overdueCount);
  for (const item of overdue) assert.ok(!terminal.includes(item.status), `${item.number}: завершённое не считается просроченным`);
});
