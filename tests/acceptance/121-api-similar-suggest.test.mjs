import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false }); requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8')), 'contract');
const similarSchema = ajv.compile({ $ref: 'contract#/components/schemas/SimilarComplaints' });
const suggestionSchema = ajv.compile({ $ref: 'contract#/components/schemas/CategorySuggestion' });
const errorSchema = ajv.compile({ $ref: 'contract#/components/schemas/Error' });
const seed = JSON.parse(readFileSync(new URL('../../api/data/seed.json', import.meta.url), 'utf8'));
const a001 = seed.find(row => row.number === 'A-001');

function setup(t) {
  const app = buildApp(); t.after(() => app.close());
  return app;
}
const get = (app, path, text, user = 'manager-1') => app.inject({
  url: path + (text === undefined ? '' : '?' + new URLSearchParams({ text })),
  headers: user ? { 'x-demo-user': user } : {},
});
async function similar(app, text, user) {
  const response = await get(app, '/complaints/similar', text, user);
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json(); assert.ok(similarSchema(body), JSON.stringify(similarSchema.errors));
  return body;
}
async function suggest(app, text, user) {
  const response = await get(app, '/complaints/suggest-category', text, user);
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json(); assert.ok(suggestionSchema(body), JSON.stringify(suggestionSchema.errors));
  return body;
}

test('121 text close to A-001 puts A-001 in the first three results with number, category, status and score', async t => {
  const app = setup(t);
  const body = await similar(app, 'В заявках на оборудование не хватает назначения изделия и параметров, добавить обязательные поля');
  const numbers = body.items.map(item => item.number);
  assert.ok(numbers.slice(0, 3).includes('A-001'), numbers.join());
  assert.ok(body.items.length <= 3);
  const hit = body.items.find(item => item.number === 'A-001');
  assert.equal(hit.categoryId, a001.categoryId);
  assert.equal(hit.categoryName, a001.category);
  assert.equal(hit.status, a001.status);
  for (const item of body.items) assert.ok(item.score > 0 && item.score <= 1);
  const scores = body.items.map(item => item.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test('121 identical text scores 1, case and ё are normalised', async t => {
  const app = setup(t);
  const exact = await similar(app, a001.description);
  assert.equal(exact.items[0].number, 'A-001');
  assert.equal(exact.items[0].score, 1);
  const shouted = await similar(app, a001.description.toUpperCase().replaceAll('Е', 'Ё'));
  assert.equal(shouted.items[0].number, 'A-001');
  assert.equal(shouted.items[0].score, 1);
});

test('121 results do not expose description, author or comments', async t => {
  const app = setup(t);
  const response = await get(app, '/complaints/similar', a001.description);
  const text = response.body;
  assert.ok(!text.includes(a001.description.slice(0, 30)));
  assert.ok(!/author|description|comments|employee-1|Сотрудник закупок/.test(text), text);
});

test('121 an employee only gets matches among their own complaints', async t => {
  const app = setup(t);
  const own = await similar(app, a001.description, 'employee-1');
  assert.equal(own.items[0].number, 'A-001');
  const other = await similar(app, a001.description, 'employee-2');
  assert.ok(!other.items.some(item => item.number === 'A-001'), 'employee-2 must not see employee-1 complaint');
  const ownNumbers = new Set(app.store.list().filter(item => item.author.id === 'employee-2').map(item => item.number));
  for (const item of other.items) assert.ok(ownNumbers.has(item.number));
});

test('121 text shorter than 10 characters, stop words only or no overlap give an empty list, not an error', async t => {
  const app = setup(t);
  for (const text of ['', '   ', 'короткий', '  коротко   ', 'и в на не что это как', 'zzzxqv qqqwwweee ppp']) {
    assert.deepEqual(await similar(app, text), { items: [] }, JSON.stringify(text));
  }
});

test('121 similar validates input and identity', async t => {
  const app = setup(t);
  for (const url of ['/complaints/similar', '/complaints/similar?text=' + 'я'.repeat(5001),
    '/complaints/similar?text=aaaaaaaaaaaa&extra=1']) {
    const response = await app.inject({ url, headers: { 'x-demo-user': 'manager-1' } });
    assert.equal(response.statusCode, 422, url.slice(0, 60));
    assert.ok(errorSchema(response.json()));
  }
  const anonymous = await get(app, '/complaints/similar', 'достаточно длинный текст', null);
  assert.equal(anonymous.statusCode, 401);
});

test('121 ties are ordered by createdAt descending then id ascending', async t => {
  const app = setup(t);
  const base = app.store.list()[0];
  const add = (id, number, createdAt) => app.store.save({ ...base, id, number,
    description: 'Уникальнейшая формулировка квазиплан', proposedSolution: null, comments: [], createdAt });
  add('tie-b', 'A-901', '2026-11-10T10:00:00Z'); add('tie-a', 'A-902', '2026-11-10T10:00:00Z');
  add('tie-c', 'A-903', '2026-11-11T10:00:00Z');
  const body = await similar(app, 'Уникальнейшая формулировка квазиплан');
  assert.deepEqual(body.items.map(item => item.number), ['A-903', 'A-902', 'A-901']);
});

test('121 suggest-category returns the recorded fixture category with source demo-fixture', async t => {
  const app = setup(t);
  const fixtures = JSON.parse(readFileSync(new URL('../../api/data/ai-fixtures.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(fixtures) ? fixtures.length > 0 : Object.keys(fixtures).length > 0);
  for (const row of seed) {
    const body = await suggest(app, row.description, 'employee-1');
    assert.equal(body.source, 'demo-fixture', row.number);
    assert.deepEqual(body.category, { id: row.categoryId, name: row.category }, row.number);
  }
});

test('121 suggest-category for unknown or too short text gives category null and source none', async t => {
  const app = setup(t);
  for (const text of ['Квантовый банан танцует над лунным болотом', 'коротко', '   ']) {
    assert.deepEqual(await suggest(app, text), { category: null, source: 'none' }, text);
  }
});

test('121 suggest-category works for every role and validates input', async t => {
  const app = setup(t);
  for (const user of ['employee-1', 'manager-1', 'admin-1']) {
    assert.equal((await suggest(app, a001.description, user)).source, 'demo-fixture');
  }
  for (const url of ['/complaints/suggest-category', '/complaints/suggest-category?text=' + 'я'.repeat(5001)]) {
    const response = await app.inject({ url, headers: { 'x-demo-user': 'employee-1' } });
    assert.equal(response.statusCode, 422); assert.ok(errorSchema(response.json()));
  }
  assert.equal((await get(app, '/complaints/suggest-category', 'достаточно длинный текст', null)).statusCode, 401);
});

test('121 these endpoints never touch the network', async t => {
  const app = setup(t);
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network is forbidden'); };
  t.after(() => { globalThis.fetch = original; });
  await similar(app, a001.description); await suggest(app, a001.description);
});
