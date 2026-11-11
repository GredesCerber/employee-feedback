import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';
import { createTextTranslator, TranslationUnavailable } from '../dist/ai/translate.js';

function isolatedApp(t, translator) {
  const keys = ['ANTHROPIC_API_KEY', 'PERSIST_FILE', 'DATABASE_URL'];
  const saved = keys.map(key => process.env[key]);
  let app;
  try { keys.forEach(key => delete process.env[key]); app = buildApp({}, { translator }); }
  finally { keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; }); }
  t.after(() => app.close());
  return app;
}
const request = (app, id, payload, user = 'employee-1') => app.inject({
  method: 'POST', url: `/complaints/${id}/translations`, headers: { 'x-demo-user': user }, payload,
});
async function complaint(app, extra = {}) {
  const response = await app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' },
    payload: { type: 'problem', categoryId: 'cross_department', description: 'Нужна вентиляция на складе.', ...extra } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

test('translation selects visible stored text and leaves original, history and storage untouched', async t => {
  const calls = [];
  const app = isolatedApp(t, { enabled: true, async translate(text, locale) { calls.push({ text, locale }); return 'The warehouse needs ventilation.'; } });
  const item = await complaint(app, { anonymous: true });
  const before = JSON.stringify(app.store.get(item.id));
  const response = await request(app, item.id, { field: 'description', targetLocale: 'en' }, 'manager-1');
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { translatedText: 'The warehouse needs ventilation.', targetLocale: 'en', source: 'llm' });
  assert.deepEqual(calls, [{ text: item.description, locale: 'en' }]);
  assert.equal(JSON.stringify(app.store.get(item.id)), before);
});

test('foreign and invalid sources are rejected before the translator; no key gives explicit 503', async t => {
  let called = 0;
  const app = isolatedApp(t, { enabled: true, async translate() { called++; return 'translated'; } });
  const item = await complaint(app);
  assert.equal((await request(app, item.id, { field: 'description', targetLocale: 'en' }, 'employee-2')).statusCode, 404);
  for (const body of [{ field: 'description', targetLocale: 'de' }, { field: 'author', targetLocale: 'en' },
    { field: 'comment', commentId: 'missing', targetLocale: 'en' }, { field: 'description', commentId: 'extra', targetLocale: 'en' },
    { field: 'description', targetLocale: 'en', text: 'arbitrary input' }]) {
    assert.equal((await request(app, item.id, body)).statusCode, 422);
  }
  assert.equal(called, 0);
  const offline = isolatedApp(t);
  const own = await complaint(offline);
  const response = await request(offline, own.id, { field: 'description', targetLocale: 'kk' });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, 'TRANSLATION_UNAVAILABLE');
  assert.equal(offline.store.get(own.id).description, own.description);
});

test('provider failures stay safe and do not turn the original into a purported translation', async t => {
  const app = isolatedApp(t, { enabled: true, async translate() { throw new Error('credential-and-private-text'); } });
  const item = await complaint(app);
  const response = await request(app, item.id, { field: 'description', targetLocale: 'en' });
  assert.equal(response.statusCode, 503);
  assert.ok(!response.body.includes('credential-and-private-text'));
  assert.ok(!response.body.includes(item.description));
  assert.ok(!('translatedText' in response.json()));
});

test('SDK transport sends only selected text and target language; malformed answer is unavailable', async () => {
  let sent;
  const translator = createTextTranslator({ apiKey: 'synthetic-key-for-offline-test', model: 'test-model',
    fetch: async (_url, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ id: 'msg-test', type: 'message', role: 'assistant', model: 'test-model',
        content: [{ type: 'text', text: JSON.stringify({ text: 'Қоймаға желдету қажет.' }) }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    } });
  assert.equal(await translator.translate('Нужна вентиляция.', 'kk'), 'Қоймаға желдету қажет.');
  assert.deepEqual(JSON.parse(sent.messages[0].content), { targetLocale: 'kk', text: 'Нужна вентиляция.' });
  assert.equal(sent.messages.length, 1);
  const unavailable = createTextTranslator({ apiKey: 'synthetic-key-for-offline-test',
    fetch: async () => Response.json({ id: 'msg-test', type: 'message', role: 'assistant', model: 'test-model',
      content: [{ type: 'text', text: 'not valid JSON' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) });
  await assert.rejects(unavailable.translate('Text', 'ru'), TranslationUnavailable);
  await assert.rejects(createTextTranslator({}).translate('Text', 'en'), TranslationUnavailable);
});
