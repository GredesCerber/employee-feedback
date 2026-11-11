import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../api/dist/app.js';

function setup(t) {
  const app = buildApp(); t.after(() => app.close());
  let number = 1900;
  const add = (id, fields = {}) => {
    const item = { ...app.store.list()[0], id, number: `A-${++number}`, description: 'Обычное описание',
      proposedSolution: null, comments: [], status: 'new', decision: null, firstResponseAt: null,
      createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z', ...fields };
    app.store.save(item); return item;
  };
  return { app, add };
}
const get = (app, query = {}, user = 'manager-1') => app.inject({
  url: '/complaints/export?' + new URLSearchParams(query), headers: user ? { 'x-demo-user': user } : {} });
// Minimal RFC 4180 parser.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const body = response => parseCsv(response.body.slice(1));
const HEADER = ['номер', 'тип', 'категория', 'подразделение', 'статус', 'ответственный', 'создано', 'срок', 'просрочено', 'первый ответ', 'итог'];
const decision = (app, explanation) => ({ outcome: 'closed', explanation, actions: null,
  author: app.store.users.find(u => u.id === 'manager-1'), createdAt: '2026-11-10T12:00:00Z' });

test('119 manager and admin get UTF-8 CSV with BOM, header row and one row per complaint', async t => {
  const { app, add } = setup(t);
  add('exp-1'); add('exp-2', { createdAt: '2026-11-09T10:00:00Z' });
  for (const user of ['manager-1', 'admin-1']) {
    const response = await get(app, {}, user);
    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.headers['content-type'], /^text\/csv; charset=utf-8/i);
    assert.ok(response.body.startsWith('﻿'));
    const rows = body(response);
    assert.deepEqual(rows[0], HEADER);
    assert.equal(rows.length - 1, app.store.list().length);
    assert.match(response.headers['content-disposition'], /^attachment; filename="obrasheniya-\d{4}-\d{2}-\d{2}\.csv"$/);
  }
});

test('119 export uses the list filters, rejects pagination and returns only the header for an empty set', async t => {
  const { app, add } = setup(t);
  add('exp-f1', { description: 'Фильтр119 один', status: 'in_progress' });
  add('exp-f2', { description: 'Фильтр119 два', status: 'new' });
  assert.equal(body(await get(app, { q: 'фильтр119', status: 'in_progress' })).length, 2);
  assert.equal(body(await get(app, { q: 'фильтр119' })).length, 3);
  const empty = await get(app, { q: 'несуществующее119' });
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.body, '﻿' + HEADER.join(',') + '\r\n');
  assert.equal((await get(app, { q: '   ' })).statusCode, 422);
  assert.equal((await get(app, { limit: '1' })).statusCode, 422);
  assert.equal((await get(app, { bogus: '1' })).statusCode, 422);
});

test('119 cells with commas, quotes and line breaks are escaped per RFC 4180', async t => {
  const { app, add } = setup(t);
  const text = 'Есть "кавычки", запятая\nи перевод строки';
  add('exp-rfc', { status: 'closed', decision: decision(app, text) });
  const response = await get(app, { q: 'A-1901' });
  assert.ok(response.body.includes('"Есть ""кавычки"", запятая\nи перевод строки"'), response.body);
  const rows = body(response);
  assert.equal(rows.length, 2); assert.equal(rows[1].length, HEADER.length); assert.equal(rows[1][10], text);
});

test('119 cells starting with = + - @ are protected from spreadsheet formulas', async t => {
  const { app, add } = setup(t);
  ['=1+1', '+SUM(A1)', '-2', '@cmd', '  =HYPERLINK("x")'].forEach((explanation, index) =>
    add(`exp-formula-${index}`, { number: `F-${index}`, status: 'closed', decision: decision(app, explanation) }));
  const rows = body(await get(app, { q: 'F-' })).slice(1);
  assert.equal(rows.length, 5);
  const byNumber = Object.fromEntries(rows.map(row => [row[0], row[10]]));
  assert.equal(byNumber['F-0'], "'=1+1"); assert.equal(byNumber['F-1'], "'+SUM(A1)");
  assert.equal(byNumber['F-2'], "'-2"); assert.equal(byNumber['F-3'], "'@cmd");
  assert.ok(byNumber['F-4'].startsWith("'"));
});

test('119 columns carry number, type, category, department, status, assignee, dates, overdue, first response and result', async t => {
  const { app, add } = setup(t);
  const manager = app.store.users.find(u => u.id === 'manager-1');
  const item = add('exp-cols', { number: 'C-119', assignee: manager, status: 'closed', createdAt: '2026-11-01T10:00:00Z',
    dueAt: '2026-11-05T10:00:00Z', firstResponseAt: '2026-11-02T10:00:00Z', closedAt: '2026-11-06T10:00:00Z',
    decision: decision(app, 'Итог119') });
  add('exp-over', { number: 'C-120', status: 'new', dueAt: '2020-01-01T00:00:00Z', assignee: null });
  const rows = body(await get(app, { q: 'C-11' }));
  assert.deepEqual(rows[0], HEADER);
  const done = rows.find(r => r[0] === 'C-119');
  const { categories, departments } = app.store.referenceData;
  assert.equal(done[2], categories.find(c => c.id === item.categoryId).name);
  assert.equal(done[3], departments.find(d => d.id === item.departmentId).name);
  assert.equal(done[5], manager.name);
  assert.equal(done[6], '2026-11-01T10:00:00.000Z'); assert.equal(done[7], '2026-11-05T10:00:00.000Z');
  assert.equal(done[8], 'нет'); assert.equal(done[9], '2026-11-02T10:00:00.000Z'); assert.equal(done[10], 'Итог119');
  const late = body(await get(app, { q: 'C-120' }))[1];
  assert.equal(late[8], 'да'); assert.equal(late[5], ''); assert.equal(late[9], ''); assert.equal(late[10], '');
});

test('119 employee gets 403, anonymous gets 401', async t => {
  const { app } = setup(t);
  const forbidden = await get(app, {}, 'employee-1');
  assert.equal(forbidden.statusCode, 403); assert.equal(forbidden.json().code, 'FORBIDDEN');
  assert.equal((await get(app, {}, null)).statusCode, 401);
});

test('119 export never reveals the author of any complaint', async t => {
  const { app, add } = setup(t);
  const author = app.store.users.find(u => u.id === 'employee-2');
  add('exp-anon', { author, description: 'Анонимное119' });
  const response = await get(app, { q: 'анонимное119' });
  assert.ok(!response.body.includes(author.name)); assert.ok(!response.body.includes(author.id));
  assert.ok(!body(response)[0].includes('автор'));
});
