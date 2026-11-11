// #149: ИИ-провайдер категории с запасным вариантом на правилах слов.
// Сеть не используется: вызов LLM подменён фикстурой в формате ответа Messages API
// (api/test/fixtures/anthropic-category-response.json) через опцию fetch SDK. Ключ в тестах вымышленный.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import test from 'node:test';
import Ajv from 'ajv';
import { buildApp } from '../dist/app.js';
import { aiConfigFromEnv, createAiProvider } from '../dist/ai/provider.js';
import { suggestByRules } from '../dist/ai/rules.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const fixture = JSON.parse(read('./fixtures/anthropic-category-response.json'));
const seed = JSON.parse(read('../data/seed.json'));
const contract = JSON.parse(read('../../contracts/api.yaml'));
const FAKE_KEY = 'fake-test-key-149-not-a-real-secret';

/** Текст с ключевыми словами категории «Интеграции и IT», которого нет среди записанных примеров. */
const IT_TEXT = 'Программа учёта снова зависает при выгрузке, нужна настройка синхронизации между системами.';
/** Текст про обучение: правила должны дать другую категорию, чем фикстура LLM (it). */
const TRAINING_TEXT = 'Хотим регулярный семинар и обучение для стажёров по работе с прайс-листами.';

const ajv = new Ajv({ strict: false });
ajv.addSchema(contract, 'api');
const validSuggestion = ajv.getSchema('api#/components/schemas/CategorySuggestion');

function restoreEnv(t, name, value) {
  const previous = process.env[name];
  t.after(() => previous === undefined ? delete process.env[name] : process.env[name] = previous);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** Приложение с журналом в памяти: проверяем предупреждения и отсутствие ключа в логах. */
function setup(t) {
  const lines = [];
  const stream = new Writable({ write(chunk, _encoding, done) { lines.push(chunk.toString()); done(); } });
  const app = buildApp({ logger: { level: 'info', stream } });
  t.after(() => app.close());
  return { app, log: () => lines.join('') };
}

async function suggest(app, text, user = 'employee-1') {
  const response = await app.inject({ method: 'GET', url: `/complaints/suggest-category?text=${encodeURIComponent(text)}`,
    headers: { 'x-demo-user': user } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.ok(validSuggestion(body), JSON.stringify(validSuggestion.errors));
  return { body, raw: response.body };
}

/** Подмена fetch для SDK: записывает запросы и отвечает заданным образом. */
function fakeFetch(respond) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : null });
    return respond(init);
  };
  return { fetch, calls };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const withText = text => ({ ...fixture, content: [{ type: 'text', text }] });

test('149 без ключа: правила слов, source=rules, сети нет', async t => {
  restoreEnv(t, 'ANTHROPIC_API_KEY', undefined);
  restoreEnv(t, 'AI_MODEL', undefined);
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('сеть в тестах запрещена'); });
  for (const key of [undefined, '', '   ']) {
    restoreEnv(t, 'ANTHROPIC_API_KEY', key);
    const { app } = setup(t);
    assert.equal(app.ai.llmEnabled, false);
    const { body } = await suggest(app, IT_TEXT);
    assert.deepEqual(body, { category: { id: 'it', name: 'Интеграции и IT' }, source: 'rules' });
  }
  assert.equal(network.mock.callCount(), 0);
});

test('149 без ключа: записанные примеры #121 остаются demo-fixture, неизвестный и короткий текст дают none', async t => {
  restoreEnv(t, 'ANTHROPIC_API_KEY', undefined);
  const { app } = setup(t);
  const a001 = seed.find(row => row.number === 'A-001');
  assert.deepEqual((await suggest(app, a001.description)).body,
    { category: { id: a001.categoryId, name: a001.category }, source: 'demo-fixture' });
  for (const text of ['Квантовый банан танцует над лунным болотом', 'коротко', '   ', 'IT сбой  ']) {
    assert.deepEqual((await suggest(app, text)).body, { category: null, source: 'none' }, text);
  }
});

test('149 правила возвращают ожидаемую категорию для каждого обращения датасета', () => {
  const rules = JSON.parse(read('../data/ai-rules.json'));
  assert.ok(Array.isArray(rules) && rules.length > 0);
  const references = { categories: [...new Map(seed.map(row => [row.categoryId, { id: row.categoryId, name: row.category }])).values()] };
  for (const rule of rules) {
    assert.ok(references.categories.some(category => category.id === rule.categoryId), `нет категории ${rule.categoryId}`);
    assert.ok(Array.isArray(rule.keywords) && rule.keywords.length > 0);
  }
  for (const row of seed) {
    assert.deepEqual(suggestByRules(row.description, references), { id: row.categoryId, name: row.category }, row.number);
  }
  assert.equal(suggestByRules('Квантовый банан танцует над лунным болотом', references), null);
});

test('149 ключ есть и вызов успешен: source=llm, модель по умолчанию claude-haiku-5-5, ключ не утекает', async t => {
  const { app, log } = setup(t);
  const { fetch, calls } = fakeFetch(() => json(fixture));
  app.ai = createAiProvider({ apiKey: FAKE_KEY, fetch });
  assert.equal(app.ai.llmEnabled, true);
  assert.equal(app.ai.model, 'claude-haiku-5-5');
  // Правила дали бы «Обучение», но успешный ответ модели важнее.
  const { body, raw } = await suggest(app, TRAINING_TEXT);
  assert.deepEqual(body, { category: { id: 'it', name: 'Интеграции и IT' }, source: 'llm' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/messages$/);
  // SDK 1.x передаёт ключ в заголовке Authorization: ключ уходит только провайдеру.
  assert.equal(calls[0].headers.get('authorization'), `Bearer ${FAKE_KEY}`);
  assert.equal(calls[0].body.model, 'claude-haiku-5-5');
  assert.equal(calls[0].body.output_config.format.type, 'json_schema');
  assert.ok(JSON.stringify(calls[0].body.messages).includes(TRAINING_TEXT));
  assert.ok(!raw.includes(FAKE_KEY));
  assert.ok(!log().includes(FAKE_KEY));
});

test('149 модель задаётся AI_MODEL, ключ и модель читаются из окружения', async t => {
  restoreEnv(t, 'ANTHROPIC_API_KEY', FAKE_KEY);
  restoreEnv(t, 'AI_MODEL', undefined);
  assert.deepEqual(aiConfigFromEnv(), { apiKey: FAKE_KEY, model: 'claude-haiku-5-5' });
  restoreEnv(t, 'AI_MODEL', '  ');
  assert.equal(aiConfigFromEnv().model, 'claude-haiku-5-5');
  restoreEnv(t, 'AI_MODEL', 'claude-sonnet-5-5');
  assert.equal(aiConfigFromEnv().model, 'claude-sonnet-5-5');
  const { fetch, calls } = fakeFetch(() => json(fixture));
  const provider = createAiProvider({ ...aiConfigFromEnv(), fetch });
  const { app } = setup(t);
  assert.equal(app.ai.llmEnabled, true, 'buildApp берёт ключ из окружения');
  assert.equal(app.ai.model, 'claude-sonnet-5-5');
  app.ai = provider;
  assert.equal((await suggest(app, TRAINING_TEXT)).body.source, 'llm');
  assert.equal(calls[0].body.model, 'claude-sonnet-5-5');
});

test('149 ключ есть, вызов упал: ответ строят правила, клиент не видит ошибку, в журнале предупреждение', async t => {
  const failures = {
    'ошибка сети': () => { throw new TypeError(`fetch failed for key ${FAKE_KEY}`); },
    'HTTP 500': () => json({ type: 'error', error: { type: 'api_error', message: `upstream exploded ${FAKE_KEY}` } }, 500),
    'HTTP 401': () => json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401),
    'не JSON': () => json(withText('Думаю, это про обучение.')),
    'неизвестная категория': () => json(withText('{"categoryId":"no_such_category"}')),
    'лишние поля вместо схемы': () => json(withText('{"category":"training"}')),
    'отказ модели': () => json({ ...fixture, content: [], stop_reason: 'refusal' }),
    'обрезанный ответ': () => json({ ...fixture, content: [{ type: 'text', text: '{"categ' }], stop_reason: 'max_tokens' }),
  };
  for (const [name, respond] of Object.entries(failures)) {
    const { app, log } = setup(t);
    const { fetch, calls } = fakeFetch(respond);
    app.ai = createAiProvider({ apiKey: FAKE_KEY, fetch });
    const { body, raw } = await suggest(app, TRAINING_TEXT);
    assert.deepEqual(body, { category: { id: 'training', name: 'Обучение' }, source: 'rules' }, name);
    assert.equal(calls.length, 1, `${name}: один вызов без повторов`);
    assert.ok(!raw.includes(FAKE_KEY) && !/upstream|fetch failed|api_error/.test(raw), name);
    const entries = log().split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.ok(entries.some(entry => entry.level === 40 && /запасн/i.test(entry.msg)), `${name}: нет предупреждения в журнале`);
    assert.ok(!log().includes(FAKE_KEY), `${name}: ключ попал в журнал`);
  }
});

test('149 таймаут вызова LLM: ответ строят правила', async t => {
  const { app, log } = setup(t);
  // fetch, который не отвечает, пока SDK не прервёт запрос по таймауту.
  const { fetch, calls } = fakeFetch(init => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  app.ai = createAiProvider({ apiKey: FAKE_KEY, fetch, timeoutMs: 60 });
  const started = Date.now();
  const { body } = await suggest(app, TRAINING_TEXT);
  assert.deepEqual(body, { category: { id: 'training', name: 'Обучение' }, source: 'rules' });
  assert.equal(calls.length, 1);
  assert.ok(Date.now() - started < 2500, 'таймаут должен сработать быстро');
  assert.ok(log().split('\n').filter(Boolean).some(line => JSON.parse(line).level === 40));
  assert.equal(createAiProvider({ apiKey: FAKE_KEY }).timeoutMs, 3000, 'таймаут по умолчанию 3 с');
});

test('149 упавший LLM не ломает записанные примеры: остаётся demo-fixture', async t => {
  const { app } = setup(t);
  const { fetch } = fakeFetch(() => json({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }, 529));
  app.ai = createAiProvider({ apiKey: FAKE_KEY, fetch });
  const a007 = seed.find(row => row.number === 'A-007');
  assert.deepEqual((await suggest(app, a007.description)).body,
    { category: { id: a007.categoryId, name: a007.category }, source: 'demo-fixture' });
});

test('149 модель честно ответила «не знаю» или текст короткий: source=none, короткий текст в LLM не уходит', async t => {
  const { app } = setup(t);
  const { fetch, calls } = fakeFetch(() => json(withText('{"categoryId":null}')));
  app.ai = createAiProvider({ apiKey: FAKE_KEY, fetch });
  assert.deepEqual((await suggest(app, 'Квантовый банан танцует над лунным болотом')).body, { category: null, source: 'none' });
  assert.equal(calls.length, 1);
  for (const text of ['коротко', '   ', '  IT сбой ']) {
    assert.deepEqual((await suggest(app, text)).body, { category: null, source: 'none' }, text);
  }
  assert.equal(calls.length, 1, 'текст короче 10 символов не отправляется');
});

test('149 формат #121 сохранён: роли, 401 и 422 как раньше', async t => {
  restoreEnv(t, 'ANTHROPIC_API_KEY', undefined);
  const { app } = setup(t);
  for (const user of ['employee-1', 'manager-1', 'admin-1']) assert.equal((await suggest(app, IT_TEXT, user)).body.source, 'rules');
  for (const url of ['/complaints/suggest-category', `/complaints/suggest-category?text=${'я'.repeat(5001)}`]) {
    assert.equal((await app.inject({ method: 'GET', url, headers: { 'x-demo-user': 'employee-1' } })).statusCode, 422);
  }
  assert.equal((await app.inject({ method: 'GET', url: '/complaints/suggest-category?text=достаточно длинный текст' })).statusCode, 401);
});

test('149 переменные описаны в api/.env.example с пустыми значениями', () => {
  const lines = read('../.env.example').split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  assert.ok(lines.includes('ANTHROPIC_API_KEY='));
  assert.ok(lines.includes('AI_MODEL='));
  for (const line of lines) assert.match(line, /^[A-Z_]+=$/, `значение должно быть пустым: ${line}`);
});
