import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';
import { createAiProvider } from '../../api/dist/ai/provider.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const ajv = new (requireApi('ajv/dist/2020.js').default)({ strict: false });
requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url))), 'contract');
const validateDigest = ajv.compile({ $ref: 'contract#/components/schemas/SummaryDigest' });
const validateSuggestion = ajv.compile({ $ref: 'contract#/components/schemas/CategorySuggestion' });
const validateTrends = ajv.compile({ $ref: 'contract#/components/schemas/AnalyticsTrends' });

const NOW = Date.parse('2026-11-11T12:00:00Z');
const FAKE_KEY = 'fake-test-key-154-no-real-secret';
const ALLOWED_SUGGESTION_SOURCES = ['demo-fixture', 'rules', 'none'];

function setup(t) {
  for (const key of ['PERSIST_FILE', 'ANTHROPIC_API_KEY', 'AI_MODEL', 'SEED_RELATIVE_DATES']) {
    const before = process.env[key];
    delete process.env[key];
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  process.env.SEED_RELATIVE_DATES = '1';
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  let log = '';
  const stream = new Writable({ write(chunk, _enc, done) { log += chunk; done(); } });
  const app = buildApp({ logger: { level: 'info', stream } });
  t.after(() => app.close());
  return { app, log: () => log };
}

/** K5: any network call in the default test run must fail instead of leaving the process. */
function forbidNetwork(t) {
  return t.mock.method(globalThis, 'fetch', async (input) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    throw new Error(`network forbidden in acceptance test: ${url}`);
  });
}

const asUser = (user) => (user ? { 'x-demo-user': user } : {});
const ask = (app, url, user = 'employee-1', init = {}) => app.inject({ url, ...init, headers: { ...asUser(user), ...(init.headers ?? {}) } });

async function expectOk(response, validate) {
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  if (validate) assert.ok(validate(body), JSON.stringify(validate.errors));
  return body;
}

const SUGGEST_TEXT = 'Заявка на закупку оборудования задерживается, поставщик не отвечает';
const DIGEST = '/summary/digest';
const TRENDS = '/analytics/trends';

test('#154 K1: without a key, suggest-category, digest and trends answer from local sources only and never call fetch', async t => {
  const { app } = setup(t);
  const network = forbidNetwork(t);

  const suggestion = await expectOk(await ask(app, `/complaints/suggest-category?text=${encodeURIComponent(SUGGEST_TEXT)}`), validateSuggestion);
  assert.ok(ALLOWED_SUGGESTION_SOURCES.includes(suggestion.source), `unexpected source ${suggestion.source}`);
  assert.notEqual(suggestion.source, 'llm');

  const digest = await expectOk(await ask(app, DIGEST, 'manager-1'), validateDigest);
  assert.equal(digest.source, 'template');

  await expectOk(await ask(app, TRENDS, 'manager-1'), validateTrends);
  assert.equal(network.mock.callCount(), 0);
});

test('#154 K2: when the provider fetch throws or times out, the same three endpoints still answer 200 and never report llm', async t => {
  const { app, log } = setup(t);
  const calls = [];
  const failing = async (...args) => {
    calls.push(args);
    const error = new Error('upstream down');
    if (calls.length % 2 === 0) error.name = 'AbortError';
    throw error;
  };
  app.ai = createAiProvider({ apiKey: FAKE_KEY, timeoutMs: 50, fetch: failing });

  const suggestion = await expectOk(await ask(app, `/complaints/suggest-category?text=${encodeURIComponent(SUGGEST_TEXT)}`), validateSuggestion);
  assert.notEqual(suggestion.source, 'llm');
  assert.ok(ALLOWED_SUGGESTION_SOURCES.includes(suggestion.source));

  const digest = await expectOk(await ask(app, DIGEST, 'manager-1'), validateDigest);
  assert.notEqual(digest.source, 'llm');
  assert.equal(digest.source, 'template');

  await expectOk(await ask(app, TRENDS, 'manager-1'), validateTrends);
  assert.ok(calls.length >= 1, 'provider was expected to try the fake upstream at least once');
  assert.ok(!log().includes(FAKE_KEY));
});

test('#154 K3: the fake key never appears in any response body or log line, including failure warnings', async t => {
  const { app, log } = setup(t);
  app.ai = createAiProvider({
    apiKey: FAKE_KEY,
    timeoutMs: 50,
    fetch: async () => new Response(`bad request with ${FAKE_KEY}`, { status: 500 }),
  });
  const responses = [
    await ask(app, `/complaints/suggest-category?text=${encodeURIComponent(SUGGEST_TEXT)}`),
    await ask(app, DIGEST, 'manager-1'),
    await ask(app, TRENDS, 'manager-1'),
  ];
  for (const response of responses) {
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(!response.body.includes(FAKE_KEY), 'key leaked into a response body');
  }
  assert.ok(!log().includes(FAKE_KEY), 'key leaked into the log');
});

test('#154 K4: the demo path works without network: create complaint, suggest category, digest, dashboard', async t => {
  const { app } = setup(t);
  const network = forbidNetwork(t);

  const created = await app.inject({
    method: 'POST',
    url: '/complaints',
    headers: { ...asUser('employee-1'), 'content-type': 'application/json' },
    payload: {
      type: 'problem',
      categoryId: 'cross_department',
      description: SUGGEST_TEXT,
      proposedSolution: 'Добавить контроль сроков поставщика в форму заявки.',
      attachments: [],
    },
  });
  assert.ok([200, 201].includes(created.statusCode), created.body);

  await expectOk(await ask(app, `/complaints/suggest-category?text=${encodeURIComponent(SUGGEST_TEXT)}`), validateSuggestion);
  await expectOk(await ask(app, DIGEST, 'manager-1'), validateDigest);
  await expectOk(await ask(app, '/summary', 'admin-1'));
  await expectOk(await ask(app, TRENDS, 'manager-1'), validateTrends);
  assert.equal(network.mock.callCount(), 0);
});

test('#154 K5: the network guard itself fails on a call to api.anthropic.com', async t => {
  forbidNetwork(t);
  await assert.rejects(() => fetch('https://api.anthropic.com/v1/messages', { method: 'POST' }), /network forbidden/);
});
