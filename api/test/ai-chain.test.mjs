// Цепочка ИИ: Gemini → второй провайдер (xAI/Groq) → правила. Сеть не используется: fetch подменён.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiProvider } from '../dist/ai/provider.js';
import { compatConfigsFromEnv, timeoutFromEnv } from '../dist/ai/openai-compatible.js';
import { createTextTranslator } from '../dist/ai/translate.js';

const GEMINI_KEY = 'fake-gemini-key-not-real';
const SECOND_KEY = 'fake-second-key-not-real';
const references = { departments: [], assignees: [], categories: [
  { id: 'it', name: 'Интеграции и IT', assigneeId: null, dueInDays: 7 },
  { id: 'training', name: 'Обучение', assigneeId: null, dueInDays: 7 }] };
const TEXT = 'Хотим регулярный семинар и обучение для стажёров по работе с прайс-листами.';
const reply = content => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });

function recorder(handlers) {
  const calls = [];
  const fetch = async (url, init) => {
    const host = new URL(url).host;
    calls.push({ host, body: JSON.parse(init.body), auth: init.headers.authorization });
    return handlers[host]?.() ?? new Response('{}', { status: 500 });
  };
  return { fetch, calls };
}
const compat = [{ kind: 'gemini', apiKey: GEMINI_KEY }, { kind: 'groq', apiKey: SECOND_KEY }];

test('Gemini отвечает: второй провайдер не вызывается', async () => {
  const { fetch, calls } = recorder({ 'generativelanguage.googleapis.com': () => reply({ categoryId: 'it' }) });
  const ai = createAiProvider({ compat, fetch });
  assert.deepEqual(ai.providers, ['gemini', 'groq']);
  const result = await ai.suggestCategory(TEXT, references);
  assert.deepEqual([result.source, result.category?.id], ['llm', 'it']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].auth, `Bearer ${GEMINI_KEY}`);
  assert.equal(calls[0].body.model, 'gemini-3.8-flash');
});

test('Gemini упал: отвечает второй провайдер', async () => {
  const { fetch, calls } = recorder({ 'generativelanguage.googleapis.com': () => new Response('quota', { status: 429 }), 'api.groq.com': () => reply({ categoryId: 'training' }) });
  const result = await createAiProvider({ compat, fetch }).suggestCategory(TEXT, references);
  assert.deepEqual([result.source, result.category?.id], ['llm', 'training']);
  assert.deepEqual(calls.map(call => call.host), ['generativelanguage.googleapis.com', 'api.groq.com']);
});

test('оба упали или дали мусор: правила без ИИ, ключи не попадают в журнал', async () => {
  const { fetch } = recorder({ 'generativelanguage.googleapis.com': () => reply({ categoryId: 'unknown' }), 'api.groq.com': () => { throw new Error(`boom ${SECOND_KEY}`); } });
  const lines = [];
  const log = { warn: (...args) => lines.push(JSON.stringify(args)) };
  const result = await createAiProvider({ compat, fetch }).suggestCategory(TEXT, references, log);
  assert.equal(result.source, 'rules');
  assert.equal(result.category?.id, 'training');
  assert.equal(lines.length, 2);
  for (const line of lines) assert.ok(!line.includes(SECOND_KEY) && !line.includes(GEMINI_KEY), line);
});

test('таймаут провайдера переключает на следующего', async () => {
  const slow = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const fetch = (url, init) => new URL(url).host.startsWith('generativelanguage') ? slow(url, init) : Promise.resolve(reply({ categoryId: 'it' }));
  const started = Date.now();
  const result = await createAiProvider({ compat, fetch, timeoutMs: 60 }).suggestCategory(TEXT, references);
  assert.equal(result.category?.id, 'it');
  assert.ok(Date.now() - started < 1500);
});

test('перевод идёт по цепочке и недоступен без ключей', async () => {
  const { fetch } = recorder({ 'generativelanguage.googleapis.com': () => new Response('x', { status: 503 }), 'api.groq.com': () => reply({ text: 'Hello' }) });
  const translator = createTextTranslator({ compat, fetch });
  assert.equal(translator.enabled, true);
  assert.equal(await translator.translate('Привет', 'en'), 'Hello');
  assert.equal(createTextTranslator({}).enabled, false);
});

test('настройки из окружения: ключи, второй провайдер, таймаут', () => {
  assert.deepEqual(compatConfigsFromEnv({}), []);
  assert.deepEqual(compatConfigsFromEnv({ GEMINI_API_KEY: ' g ' }).map(c => c.kind), ['gemini']);
  assert.deepEqual(compatConfigsFromEnv({ GEMINI_API_KEY: 'g', XAI_API_KEY: 'x' }).map(c => c.kind), ['gemini', 'xai']);
  assert.deepEqual(compatConfigsFromEnv({ GROQ_API_KEY: 'q' }).map(c => c.kind), ['groq']);
  assert.deepEqual(compatConfigsFromEnv({ XAI_API_KEY: 'x', GROQ_API_KEY: 'q', AI_FALLBACK_PROVIDER: 'groq' }).map(c => c.kind), ['groq']);
  assert.deepEqual(compatConfigsFromEnv({ AI_FALLBACK_PROVIDER: 'xai' }), [], 'без ключа второго провайдера нет');
  assert.equal(timeoutFromEnv({ AI_TIMEOUT_MS: '5000' }), 5000);
  assert.equal(timeoutFromEnv({ AI_TIMEOUT_MS: '10' }), undefined);
  assert.equal(timeoutFromEnv({}), undefined);
});

test('без ключей ИИ выключен и сеть не нужна', async () => {
  const ai = createAiProvider({});
  assert.equal(ai.llmEnabled, false);
  assert.deepEqual(ai.providers, []);
});
