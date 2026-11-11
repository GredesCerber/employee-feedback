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
const validate = ajv.compile({ $ref: 'contract#/components/schemas/SummaryDigest' });
const fixture = JSON.parse(readFileSync(new URL('../../api/test/fixtures/anthropic-category-response.json', import.meta.url)));
const NOW = Date.parse('2026-11-11T12:00:00Z');
const KEY = 'fake-test-key-150-no-real-secret';
const response = text => Response.json({ ...fixture, content: [{ type: 'text', text }] });

function setup(t, clock = true) {
  for (const key of ['PERSIST_FILE', 'ANTHROPIC_API_KEY']) {
    const before = process.env[key]; delete process.env[key];
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  if (clock) t.mock.timers.enable({ apis: ['Date'], now: NOW });
  let log = '';
  const stream = new Writable({ write(chunk, _enc, done) { log += chunk; done(); } });
  const app = buildApp({ logger: { level: 'info', stream } });
  t.after(() => app.close());
  return { app, log: () => log };
}
const request = (app, query = '', user = 'manager-1') => app.inject({ url: `/summary/digest${query}`, headers: user ? { 'x-demo-user': user } : {} });
async function digest(app, query = '', user) {
  const r = await request(app, query, user);
  assert.equal(r.statusCode, 200, r.body);
  const body = r.json();
  assert.ok(validate(body), JSON.stringify(validate.errors));
  return body;
}

test('#150 without a key reports correct seed counts for the default seven-day cohort without network', async t => {
  const { app } = setup(t);
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('network forbidden'); });
  const rows = app.store.list().filter(item => Date.parse(item.createdAt) >= NOW - 7 * 86400000 && Date.parse(item.createdAt) < NOW);
  const counts = new Map();
  for (const item of rows) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
  const [categoryId, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const category = app.store.referenceData.categories.find(item => item.id === categoryId).name;
  const overdue = rows.filter(item => !['implemented', 'rejected', 'closed'].includes(item.status) && Date.parse(item.dueAt) < NOW).length;
  const result = await digest(app);
  assert.equal(result.source, 'template');
  assert.deepEqual(result.period, { from: new Date(NOW - 7 * 86400000).toISOString(), to: new Date(NOW).toISOString() });
  assert.ok(result.text.includes(String(rows.length)));
  assert.ok(result.text.includes(category) && result.text.includes(String(count)));
  assert.ok(result.highlights.includes(`Просрочено: ${overdue}.`));
  assert.equal(network.mock.callCount(), 0);
});

test('#150 the period is half-open, department filters every aggregate, empty results never call the model', async t => {
  const { app } = setup(t);
  const sample = app.store.list()[0];
  app.store.records.clear();
  const rows = [
    ['before', '2026-11-04T11:59:59Z', 'procurement'],
    ['start', '2026-11-04T12:00:00Z', 'procurement'],
    ['inside', '2026-11-10T12:00:00Z', 'procurement'],
    ['other', '2026-11-10T12:00:00Z', 'sales'],
    ['end', '2026-11-11T12:00:00Z', 'procurement'],
  ];
  for (const [id, createdAt, departmentId] of rows) app.store.save({ ...sample, id, departmentId, createdAt, status: 'new', dueAt: '2026-11-10T13:00:00Z' });
  const result = await digest(app, '?from=2026-11-04T12:00:00Z&to=2026-11-11T12:00:00Z&department=procurement');
  assert.ok(result.highlights.includes('Всего за период: 2.'));
  assert.ok(result.highlights.includes('Просрочено: 2.'));
  const calls = [];
  app.ai = createAiProvider({ apiKey: KEY, fetch: async (...args) => { calls.push(args); throw new Error('must not call'); } });
  const empty = await digest(app, '?department=unknown');
  assert.equal(empty.source, 'template');
  assert.match(empty.text.toLowerCase(), /обращений за период нет/);
  assert.deepEqual(empty.highlights, []);
  app.store.records.clear();
  assert.match((await digest(app)).text.toLowerCase(), /обращений за период нет/);
  assert.equal(calls.length, 0);
});

test('#150 only managers/admins may read and query parameters are validated', async t => {
  const { app } = setup(t);
  assert.equal((await request(app, '', 'employee-1')).statusCode, 403);
  assert.equal((await request(app, '', null)).statusCode, 401);
  await digest(app, '', 'admin-1');
  for (const query of ['?from=no', '?to=no', '?from=2026-11-11T12:00:00Z&to=2026-11-11T12:00:00Z', '?department=', '?department=bad%20id', '?from=2026-11-12T12:00:00Z', '?extra=yes', '?department=a&department=b']) {
    assert.equal((await request(app, query)).statusCode, 422, query);
  }
  const fromOnly = await digest(app, '?from=2026-11-10T12:00:00Z');
  assert.equal(fromOnly.period.to, new Date(NOW).toISOString());
  const toOnly = await digest(app, '?to=2026-11-10T12:00:00Z');
  assert.equal(toOnly.period.from, '2026-11-03T12:00:00.000Z');
});

test('#150 the shared provider receives only aggregates and cache expires at 60 seconds or changed facts', async t => {
  const { app } = setup(t);
  const calls = [];
  app.ai = createAiProvider({ apiKey: KEY, fetch: async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    const facts = JSON.parse(body.messages[0].content);
    return response(JSON.stringify({ text: `За период поступило ${facts.total} обращений. Просрочено: ${facts.overdueCount}.` }));
  } });
  const first = await digest(app);
  assert.equal(first.source, 'llm');
  assert.equal(calls.length, 1);
  const payload = calls[0].messages[0].content;
  const facts = JSON.parse(payload);
  assert.deepEqual(Object.keys(facts).sort(), ['byCategory', 'byDepartment', 'overdueCount', 'total']);
  for (const entry of [...facts.byCategory, ...facts.byDepartment]) assert.deepEqual(Object.keys(entry).sort(), ['count', 'name']);
  for (const item of app.store.list()) {
    assert.ok(!payload.includes(item.author.id));
    assert.ok(!payload.includes(item.author.name));
    assert.ok(!payload.includes(item.description));
    assert.ok(!payload.includes(`"${item.id}"`));
  }
  t.mock.timers.tick(59_999);
  assert.deepEqual(await digest(app), first, 'cached period and generatedAt must remain visible');
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  assert.notEqual((await digest(app)).generatedAt, first.generatedAt);
  assert.equal(calls.length, 2);
  const sample = app.store.list()[0];
  app.store.save({ ...sample, id: 'new-for-digest', createdAt: new Date(Date.now() - 1000).toISOString() });
  await digest(app);
  assert.equal(calls.length, 3, 'changed aggregate facts invalidate the cache immediately');
});

test('#150 provider failures, timeouts and invalid text fall back without leaking credentials', async t => {
  const failures = [
    async () => { throw new Error(`network failure ${KEY}`); },
    async () => Response.json({ error: { message: KEY } }, { status: 500 }),
    async () => response('not JSON'),
    async () => response(JSON.stringify({ text: '  ' })),
    async () => response(JSON.stringify({ text: KEY })),
    async (_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }),
  ];
  for (const fetch of failures) {
    const { app, log } = setup(t, false);
    app.ai = createAiProvider({ apiKey: KEY, fetch, timeoutMs: 30 });
    const result = await digest(app);
    assert.equal(result.source, 'template');
    assert.ok(!JSON.stringify(result).includes(KEY));
    assert.ok(!log().includes(KEY));
  }
});
