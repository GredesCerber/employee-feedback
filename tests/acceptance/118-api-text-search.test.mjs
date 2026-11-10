import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false }); requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8')), 'contract');
const listSchema = ajv.compile({ $ref: 'contract#/components/schemas/ComplaintList' });
const errorSchema = ajv.compile({ $ref: 'contract#/components/schemas/Error' });
function setup(t) {
  const app = buildApp(); t.after(() => app.close());
  let number = 900;
  const add = (id, fields = {}) => {
    const item = { ...app.store.list()[0], id, number: `A-${++number}`,
      description: 'Обычное описание', proposedSolution: null, comments: [], status: 'new',
      createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z',
      ...fields };
    app.store.save(item); return item;
  };
  const comment = text => ({ id: 'search-comment', kind: 'comment', text,
    author: app.store.users.find(user => user.id === 'manager-1'), createdAt: '2026-11-10T11:00:00Z' });
  return { app, add, comment };
}
async function search(app, q, filters = {}, user = 'manager-1') {
  const response = await app.inject({ url: '/complaints?' + new URLSearchParams({ q, ...filters }),
    headers: user ? { 'x-demo-user': user } : {} });
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json(); assert.ok(listSchema(result), JSON.stringify(listSchema.errors));
  return result;
}
const ids = result => result.items.map(item => item.id);

test('118 literal case-insensitive search includes description, proposed solution, number and comments', async t => {
  const { app, add, comment } = setup(t);
  add('search-description', { description: 'СКЛАДкварц118 требует внимания' });
  add('search-solution', { proposedSolution: 'Перенести на складКварц118' });
  add('search-comment', { comments: [comment('Проверили СкЛаДкВаРц118')] });
  const numbered = add('search-number');
  add('search-other');
  const before = app.store.list();
  assert.deepEqual(new Set(ids(await search(app, 'складкварц118'))), new Set(['search-description', 'search-solution', 'search-comment']));
  assert.deepEqual(ids(await search(app, numbered.number.toLowerCase())), ['search-number']);
  assert.equal((await search(app, '.*')).total, 0, 'query is literal, not a regular expression');
  assert.deepEqual(app.store.list(), before, 'search does not mutate stored text');
});

test('118 е and ё are equivalent in both query directions', async t => {
  const { app, add, comment } = setup(t);
  add('search-e', { description: 'Елка118 рядом со входом' });
  add('search-yo', { comments: [comment('Ёлка118 рядом со входом')] });
  for (const q of ['елка118', 'ЁЛКА118']) assert.deepEqual(new Set(ids(await search(app, q))), new Set(['search-e', 'search-yo']));
});

test('118 all words must match, regardless of order and across supported fields', async t => {
  const { app, add, comment } = setup(t);
  add('search-and-a', { description: 'Поиск118 мокрые', proposedSolution: 'Убрать мешки' });
  add('search-and-b', { description: 'Мешки поиск118', comments: [comment('Они мокрые')] });
  add('search-partial', { description: 'Поиск118 мокрые доски' });
  for (const q of ['поиск118 мокрые мешки', 'мешки  ПОИСК118\tмокрые', 'мокрые поиск118 мешки мешки']) {
    assert.deepEqual(new Set(ids(await search(app, q))), new Set(['search-and-a', 'search-and-b']));
  }
  assert.equal((await search(app, 'поиск118 отсутствующее')).total, 0);
});

test('118 search combines category/status filters and keeps date/id ordering and pagination stable', async t => {
  const { app, add } = setup(t);
  const [first, second] = app.store.referenceData.categories;
  const fields = { description: 'Порядок118 общий', categoryId: first.id, status: 'new' };
  add('search-sort-b', fields); add('search-sort-a', fields);
  add('search-sort-c', { ...fields, createdAt: '2026-11-09T10:00:00Z' });
  add('search-wrong-category', { ...fields, categoryId: second.id });
  add('search-wrong-status', { ...fields, status: 'in_progress' });
  const filters = { categoryId: first.id, status: 'new' };
  for (let repeat = 0; repeat < 2; repeat++) assert.deepEqual(ids(await search(app, 'общий порядок118', filters)), ['search-sort-a', 'search-sort-b', 'search-sort-c']);
  const page = await search(app, 'порядок118', { ...filters, offset: '1', limit: '1' });
  assert.deepEqual(ids(page), ['search-sort-b']); assert.equal(page.total, 3);
});

test('118 employee search cannot reveal another author through results or total', async t => {
  const { app, add, comment } = setup(t);
  const first = app.store.users.find(user => user.id === 'employee-1');
  const second = app.store.users.find(user => user.id === 'employee-2');
  add('search-own', { author: first, description: 'Секретпоиска118' });
  add('search-hidden', { author: second, comments: [comment('Секретпоиска118')] });
  const own = await search(app, 'секретпоиска118', {}, first.id);
  assert.deepEqual(ids(own), ['search-own']); assert.equal(own.total, 1);
  assert.deepEqual(ids(await search(app, 'секретпоиска118', {}, second.id)), ['search-hidden']);
  assert.equal((await search(app, 'секретпоиска118')).total, 2);
  const anonymous = await app.inject({ url: '/complaints?q=' + encodeURIComponent('секретпоиска118') });
  assert.equal(anonymous.statusCode, 401);
});

test('118 query length boundary follows contract: 200 accepted, 201 rejected with 422', async t => {
  const { app } = setup(t);
  assert.equal((await search(app, 'я'.repeat(200))).total, 0);
  const response = await app.inject({ url: '/complaints?q=' + encodeURIComponent('я'.repeat(201)), headers: { 'x-demo-user': 'manager-1' } });
  assert.equal(response.statusCode, 422);
  assert.ok(errorSchema(response.json()), JSON.stringify(errorSchema.errors));
});
