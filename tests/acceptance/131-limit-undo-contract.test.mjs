import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

// Public HTTP behavior only: no store access, route internals or external services.
const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false, allErrors: true });
requireApi('ajv-formats').default(ajv);
const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
ajv.addSchema(contract, 'contract');
const validators = new Map();
const resolve = ref => ref.slice(2).split('/').reduce((value, part) => value[part], contract);

async function request(app, method, route, { id, payload, user = 'manager-1', expected = 200, code } = {}) {
  const response = await app.inject({ method, url: route.replace('{complaintId}', id ?? ''),
    headers: { 'x-demo-user': user }, ...(payload === undefined ? {} : { payload }) });
  assert.equal(response.statusCode, expected, response.body);
  let definition = contract.paths[route.split('?')[0]][method.toLowerCase()].responses[String(expected)];
  assert.ok(definition, `Undocumented response: ${method} ${route} ${expected}`);
  if (definition.$ref) definition = resolve(definition.$ref);
  assert.match(response.headers['content-type'], /^application\/json/);
  const schema = definition.content['application/json'].schema;
  const key = JSON.stringify(schema);
  if (!validators.has(key)) validators.set(key, ajv.compile(schema.$ref ? { $ref: `contract${schema.$ref}` } : schema));
  const validate = validators.get(key);
  const body = response.json();
  assert.ok(validate(body), `${method} ${route}: ${JSON.stringify(validate.errors)}`);
  if (code) assert.equal(body.code, code);
  return { body, headers: response.headers };
}

function setup(t, env = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-11T10:00:00Z') });
  const values = { NODE_ENV: 'development', RATE_LIMIT_MAX: '0', RATE_LIMIT_WINDOW_S: '60',
    UNDO_WINDOW_S: '600', PERSIST_FILE: undefined, DATABASE_URL: undefined, ANTHROPIC_API_KEY: undefined, ...env };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('#131 must not use network fetch'); });
  const app = buildApp();
  t.after(() => app.close());
  return app;
}
async function create(app, user = 'employee-1') {
  return (await request(app, 'POST', '/complaints', { user, expected: 201,
    payload: { type: 'problem', categoryId: 'no_rule_demo', description: 'Синтетический сценарий приёмки лимита и отката.' } })).body;
}
const read = async (app, id, user = 'manager-1') => (await request(app, 'GET', '/complaints/{complaintId}', { id, user })).body;
const status = (app, id, value, user = 'manager-1') => request(app, 'PATCH', '/complaints/{complaintId}/status', { id, user, payload: { status: value } });
const undo = (app, id, extra = {}) => request(app, 'POST', '/complaints/{complaintId}/undo', { id, ...extra });

test('#131 write quota also guards undo; reads and another user survive, then undo restores both snapshots', async t => {
  const app = setup(t, { RATE_LIMIT_MAX: '2' });
  const initial = await create(app);
  await request(app, 'PATCH', '/complaints/{complaintId}/assignment', { id: initial.id, payload: { assigneeId: 'manager-2' } });
  t.mock.timers.tick(1000);
  const changed = (await status(app, initial.id, 'in_review')).body;
  assert.equal(changed.assignee.id, 'manager-2');
  assert.ok(changed.firstResponseAt);
  const limited = await undo(app, initial.id, { expected: 429, code: 'RATE_LIMITED' });
  assert.match(limited.headers['retry-after'], /^\d+$/);
  assert.ok(Number(limited.headers['retry-after']) > 0 && Number(limited.headers['retry-after']) <= 60);
  assert.deepEqual(await read(app, initial.id), changed, 'Rejected undo must not change the complaint');
  await request(app, 'GET', '/complaints?limit=100');
  await create(app, 'employee-2');

  t.mock.timers.tick(60_000);
  const statusRestored = (await undo(app, initial.id)).body;
  assert.equal(statusRestored.status, initial.status);
  assert.equal(statusRestored.assignee.id, 'manager-2', 'First undo restores the snapshot after assignment');
  assert.equal(statusRestored.firstResponseAt, initial.firstResponseAt);
  const assignmentRestored = (await undo(app, initial.id)).body;
  assert.equal(assignmentRestored.status, initial.status);
  assert.deepEqual(assignmentRestored.assignee, initial.assignee);
  assert.deepEqual(assignmentRestored.routing, initial.routing);
  assert.equal(assignmentRestored.firstResponseAt, initial.firstResponseAt);
  assert.equal(assignmentRestored.dueAt, initial.dueAt);
  assert.equal(assignmentRestored.history.filter(event => event.kind === 'undone').length, 2);
  assert.deepEqual(assignmentRestored.history.slice(0, changed.history.length), changed.history);
  assert.deepEqual(await read(app, initial.id), assignmentRestored);
});

test('#131 undo expires at the exact configured second and errors leave the public state intact', async t => {
  const app = setup(t, { UNDO_WINDOW_S: '1' });
  const initial = await create(app);
  await status(app, initial.id, 'in_review');
  t.mock.timers.tick(999);
  assert.equal((await read(app, initial.id)).canUndo, true);
  t.mock.timers.tick(1);
  const before = await read(app, initial.id);
  assert.equal(before.canUndo, false);
  await undo(app, initial.id, { expected: 409, code: 'UNDO_EXPIRED' });
  assert.deepEqual(await read(app, initial.id), before);
});

for (const barrier of ['foreign manager', 'comment', 'decision']) {
  test(`#131 ${barrier} is not an eligible action for undo`, async t => {
    const app = setup(t);
    const initial = await create(app);
    await status(app, initial.id, 'in_review');
    if (barrier === 'foreign manager') await status(app, initial.id, 'in_progress', 'manager-2');
    if (barrier === 'comment') await request(app, 'POST', '/complaints/{complaintId}/comments', {
      id: initial.id, expected: 201, payload: { kind: 'comment', text: 'Комментарий не является отменяемым действием.' },
    });
    if (barrier === 'decision') await request(app, 'POST', '/complaints/{complaintId}/decision', {
      id: initial.id, expected: 201, payload: { outcome: 'rejected', explanation: 'Синтетическое мотивированное решение для проверки границ.' },
    });
    const before = await read(app, initial.id);
    assert.equal(before.canUndo, false);
    await undo(app, initial.id, { expected: 409, code: 'NOTHING_TO_UNDO' });
    assert.deepEqual(await read(app, initial.id), before);
  });
}
