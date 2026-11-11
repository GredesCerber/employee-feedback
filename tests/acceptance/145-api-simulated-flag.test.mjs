// #145: заголовок X-Demo-Source: simulator помечает обращения и события флагом simulated (только при DEMO_SIMULATION_ENABLED=true).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false, allErrors: true });
requireApi('ajv-formats').default(ajv);
const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
ajv.addSchema(contract, 'contract');
const validateComplaint = ajv.compile({ $ref: 'contract#/components/schemas/Complaint' });

const payload = { type: 'problem', categoryId: 'cross_department', description: 'Имитация обращения для проверки флага.' };
const SIM = { 'x-demo-source': 'simulator' };

function setup(t, env = {}) {
  const values = { NODE_ENV: 'development', RATE_LIMIT_MAX: '0', RATE_LIMIT_WINDOW_S: '60', DEMO_RESET_ENABLED: undefined,
    DEMO_SIMULATION_ENABLED: 'true', PERSIST_FILE: undefined, DATABASE_URL: undefined, ANTHROPIC_API_KEY: undefined, ...env };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  const app = buildApp();
  t.after(async () => {
    await app.close();
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  return app;
}
const send = (app, method, url, user, body, extra = {}) => app.inject({ method, url,
  headers: { 'x-demo-user': user, ...extra }, ...(body === undefined ? {} : { payload: body }) });
const create = (app, extra = {}) => send(app, 'POST', '/complaints', 'employee-1', payload, extra);

test('#145 header with simulation enabled: simulated true in POST and GET, contract-valid', async t => {
  const app = setup(t);
  const created = await create(app, SIM);
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().simulated, true);
  assert.ok(validateComplaint(created.json()), JSON.stringify(validateComplaint.errors));
  for (const event of created.json().history) assert.equal(event.simulated, true);
  const read = await send(app, 'GET', `/complaints/${created.json().id}`, 'employee-1');
  assert.equal(read.json().simulated, true);
  assert.ok(validateComplaint(read.json()), JSON.stringify(validateComplaint.errors));
});

test('#145 no header: simulated false everywhere, including seed complaints', async t => {
  const app = setup(t);
  const created = await create(app);
  assert.equal(created.json().simulated, false);
  assert.ok(created.json().history.every(event => event.simulated === false));
  const list = await send(app, 'GET', '/complaints?limit=100', 'manager-1');
  assert.ok(list.json().items.length > 1);
  assert.ok(list.json().items.every(item => item.simulated === false || item.id === undefined));
  const unknown = await create(app, { 'x-demo-source': 'other' });
  assert.equal(unknown.json().simulated, false);
});

test('#145 simulation disabled or unset: header is ignored', async t => {
  for (const value of [undefined, 'false', 'TRUE', '1']) {
    const app = setup(t, { DEMO_SIMULATION_ENABLED: value });
    const created = await create(app, SIM);
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().simulated, false, `DEMO_SIMULATION_ENABLED=${value}`);
    const complaintId = created.json().id;
    const status = await send(app, 'PATCH', `/complaints/${complaintId}/status`, 'manager-1', { status: 'in_review' }, SIM);
    assert.equal(status.statusCode, 200);
    assert.ok(status.json().history.every(event => event.simulated === false));
  }
});

test('#145 manager actions with the header mark history events; actions without it do not', async t => {
  const app = setup(t);
  const { id } = (await create(app, SIM)).json();
  const status = await send(app, 'PATCH', `/complaints/${id}/status`, 'manager-1', { status: 'in_review' }, SIM);
  assert.equal(status.statusCode, 200, status.body);
  assert.equal(status.json().history.at(-1).kind, 'status_changed');
  assert.equal(status.json().history.at(-1).simulated, true);
  const comment = await send(app, 'POST', `/complaints/${id}/comments`, 'manager-1',
    { kind: 'comment', text: 'Имитация комментария руководителя.' }, SIM);
  assert.equal(comment.statusCode, 201, comment.body);
  assert.equal(comment.json().history.at(-1).kind, 'commented');
  assert.equal(comment.json().history.at(-1).simulated, true);
  const plain = await send(app, 'POST', `/complaints/${id}/comments`, 'manager-1', { kind: 'comment', text: 'Живой комментарий.' });
  assert.equal(plain.json().history.at(-1).simulated, false);
  const decision = await send(app, 'POST', `/complaints/${id}/decision`, 'manager-1',
    { outcome: 'implemented', explanation: 'Решение принято в имитации.' }, SIM);
  assert.equal(decision.statusCode, 201, decision.body);
  assert.equal(decision.json().history.at(-1).simulated, true);
  assert.ok(validateComplaint(decision.json()), JSON.stringify(validateComplaint.errors));
});

test('#145 notification feed events about simulated complaints are marked simulated', async t => {
  const app = setup(t);
  const { id } = (await create(app, SIM)).json();
  await send(app, 'POST', `/complaints/${id}/comments`, 'manager-1',
    { kind: 'clarification_request', text: 'Уточните, пожалуйста, детали.' }, SIM);
  const feed = await send(app, 'GET', '/notifications', 'employee-1');
  const events = feed.json().items.filter(item => item.complaintId === id);
  assert.ok(events.length >= 1);
  assert.ok(events.every(event => event.simulated === true));
});

test('#145 GET /complaints?simulated=false hides simulated, no parameter shows all', async t => {
  const app = setup(t);
  const { id } = (await create(app, SIM)).json();
  const live = (await create(app)).json().id;
  const idsOf = async query => (await send(app, 'GET', `/complaints?limit=100${query}`, 'manager-1')).json().items.map(item => item.id);
  const all = await idsOf('');
  assert.ok(all.includes(id) && all.includes(live));
  const hidden = await idsOf('&simulated=false');
  assert.ok(!hidden.includes(id) && hidden.includes(live));
  const only = await idsOf('&simulated=true');
  assert.deepEqual(only, [id]);
  const bad = await send(app, 'GET', '/complaints?simulated=maybe', 'manager-1');
  assert.equal(bad.statusCode, 422);
});

test('#145 POST /demo/reset removes simulated complaints with the rest', async t => {
  const app = setup(t);
  const seedCount = app.store.list().length;
  const { id } = (await create(app, SIM)).json();
  const reset = await send(app, 'POST', '/demo/reset', 'admin-1');
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.json().loadedCount, seedCount);
  assert.equal((await send(app, 'GET', `/complaints/${id}`, 'manager-1')).statusCode, 404);
  const list = await send(app, 'GET', '/complaints?simulated=true', 'admin-1');
  assert.equal(list.json().total, 0);
});

test('#145 the header grants nothing: roles, validation and rate limit work as usual', async t => {
  const app = setup(t, { NODE_ENV: 'development', RATE_LIMIT_MAX: '2' });
  const manager = await send(app, 'POST', '/complaints', 'manager-1', payload, SIM);
  assert.equal(manager.statusCode, 403);
  const adminReset = await send(app, 'POST', '/demo/reset', 'employee-1', undefined, SIM);
  assert.equal(adminReset.statusCode, 403);
  const anonymous = await app.inject({ method: 'POST', url: '/complaints', headers: SIM, payload });
  assert.equal(anonymous.statusCode, 401);
  const invalid = await send(app, 'POST', '/complaints', 'employee-1', { ...payload, categoryId: 'nope' }, SIM);
  assert.equal(invalid.statusCode, 422);
  // The earlier requests share buckets per identity; employee-2 gets exactly the configured two writes.
  assert.equal((await send(app, 'POST', '/complaints', 'employee-2', payload, SIM)).statusCode, 201);
  assert.equal((await send(app, 'POST', '/complaints', 'employee-2', payload, SIM)).statusCode, 201);
  const limited = await send(app, 'POST', '/complaints', 'employee-2', payload, SIM);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().code, 'RATE_LIMITED');
});

test('#145 contract documents the header, the field and the filter additively', () => {
  const header = contract.paths['/complaints'].post.parameters.find(parameter => parameter.name === 'X-Demo-Source');
  assert.equal(header.in, 'header');
  assert.notEqual(header.required, true);
  assert.deepEqual(header.schema.enum, ['simulator']);
  assert.equal(contract.components.schemas.Complaint.properties.simulated.type, 'boolean');
  assert.equal(contract.components.schemas.HistoryEvent.properties.simulated.type, 'boolean');
  assert.ok(!contract.components.schemas.Complaint.required.includes('simulated'));
  // The established filter parameter list is locked by older acceptance tests, so the filter lives in the description.
  assert.match(contract.paths['/complaints'].get.description, /simulated=true\|false/);
});
