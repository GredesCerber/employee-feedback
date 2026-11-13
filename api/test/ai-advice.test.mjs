// «Помощь ИИ» (POST /complaints/{id}/advice): варианты решения для роли того, кто спрашивает.
// Сеть не используется: globalThis.fetch подменён до сборки приложения, ключи синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';
import { adviceByRules, parseAdvice } from '../dist/ai/advice.js';

const GEMINI_KEY = 'fake-gemini-key-for-advice';
const AI_KEYS = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY', 'GROQ_API_KEY', 'AI_FALLBACK_PROVIDER'];
const option = n => ({ title: `Вариант ${n}`, summary: `Что сделать ${n}.`, pros: [`Плюс ${n}`], cons: [`Минус ${n}`] });
const reply = content => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });

/** App with a fake Gemini; `answer` builds the provider response. Restores env and fetch after the test. */
function appWith(t, answer) {
  const saved = Object.fromEntries(AI_KEYS.map(key => [key, process.env[key]]));
  const savedFetch = globalThis.fetch;
  const calls = [];
  for (const key of AI_KEYS) delete process.env[key];
  if (answer) {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    globalThis.fetch = async (url, init) => { calls.push({ host: new URL(url).host, body: JSON.parse(init.body) }); return answer(); };
  }
  const app = buildApp();
  t.after(async () => {
    await app.close();
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  const advise = (id, user) => app.inject({ method: 'POST', url: `/complaints/${id}/advice`, headers: { 'x-demo-user': user } });
  return { app, calls, advise };
}

function assertOptions(body) {
  assert.ok(body.options.length >= 2 && body.options.length <= 3, `options: ${body.options.length}`);
  for (const item of body.options) {
    assert.ok(item.title && item.summary);
    assert.ok(item.pros.length >= 1 && item.cons.length >= 1);
  }
}

test('без ключей: 2–3 варианта по правилам для каждой роли, сеть не нужна', async t => {
  const { advise } = appWith(t, null);
  for (const user of ['employee-1', 'manager-1', 'admin-1']) {
    const response = await advise('complaint-1', user);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().source, 'rules');
    assertOptions(response.json());
  }
});

test('с ключом: в модель уходит вся видимая переписка и роль, но без имён и ID людей; ответ помечен llm', async t => {
  const { app, calls, advise } = appWith(t, () => reply({ options: [option(1), option(2), option(3)] }));
  const item = app.store.get('complaint-1');
  const response = await advise('complaint-1', 'manager-1');
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { options: [option(1), option(2), option(3)], source: 'llm' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].host, 'generativelanguage.googleapis.com');
  const sent = calls[0].body.messages.at(-1).content;
  const context = JSON.parse(sent);
  assert.equal(context.viewerRole, 'manager');
  assert.equal(context.status, item.status);
  assert.equal(context.description, item.description);
  assert.equal(context.history.length, item.history.length);
  assert.equal(context.comments.length, item.comments.length);
  const people = [item.author, ...item.comments.map(comment => comment.author), ...item.history.map(event => event.actor)].filter(Boolean);
  for (const person of people) {
    assert.ok(!sent.includes(person.name), `name leaked: ${person.name}`);
    assert.ok(!sent.includes(`"${person.id}"`), `id leaked: ${person.id}`);
  }
  assert.ok(!response.body.includes(GEMINI_KEY));
});

test('чужое обращение: тот же 404, что и для несуществующего, провайдер не вызывается', async t => {
  const { calls, advise } = appWith(t, () => reply({ options: [option(1), option(2)] }));
  const foreign = await advise('complaint-1', 'employee-2');
  const missing = await advise('nonexistent', 'employee-2');
  assert.equal(foreign.statusCode, 404);
  const { requestId: a, ...foreignBody } = foreign.json();
  const { requestId: b, ...missingBody } = missing.json();
  assert.deepEqual(foreignBody, missingBody);
  assert.equal(calls.length, 0);
});

test('анонимное обращение не уходит в модель: ответ по правилам и без автора', async t => {
  const { app, calls, advise } = appWith(t, () => reply({ options: [option(1), option(2)] }));
  const created = await app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' },
    payload: { type: 'problem', categoryId: 'cross_department', description: 'Анонимная проблема с доступом к складу.', anonymous: true } });
  assert.equal(created.statusCode, 201, created.body);
  const author = app.store.get(created.json().id).author;
  const response = await advise(created.json().id, 'manager-1');
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().source, 'rules');
  assert.equal(calls.length, 0);
  assert.ok(!response.body.includes(author.name) && !response.body.includes(author.id));
});

test('мусор или ошибка провайдера: запасной ответ по правилам', async t => {
  for (const answer of [() => reply({ options: [option(1)] }), () => reply({ nope: true }), () => new Response('quota', { status: 429 })]) {
    const { advise } = appWith(t, answer);
    const response = await advise('complaint-1', 'employee-1');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().source, 'rules');
  }
});

test('ответ модели очищается: без HTML, не больше трёх вариантов, без ключа', () => {
  const options = parseAdvice({ options: [
    { title: '<b>Жирно</b>', summary: 'Текст  с   пробелами', pros: ['да', ''], cons: ['нет'] }, option(2), option(3), option(4)] });
  assert.equal(options.length, 3);
  assert.deepEqual(options[0], { title: 'Жирно', summary: 'Текст с пробелами', pros: ['да'], cons: ['нет'] });
  assert.throws(() => parseAdvice({ options: [option(1), { ...option(2), summary: `ключ ${GEMINI_KEY}` }] }, [GEMINI_KEY]));
  assert.throws(() => parseAdvice({ options: [option(1), { title: 'Без плюсов', summary: 'x', pros: [], cons: ['y'] }] }));
});

test('правила учитывают роль и статус', () => {
  const employeeWaiting = adviceByRules({ viewerRole: 'employee', status: 'awaiting_clarification', overdue: false });
  assert.match(employeeWaiting[0].title, /Ответить/);
  const managerNew = adviceByRules({ viewerRole: 'manager', status: 'new', overdue: false });
  assert.equal(managerNew.length, 3);
  assert.notDeepEqual(employeeWaiting, managerNew);
});
