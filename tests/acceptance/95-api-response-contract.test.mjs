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
const methods = new Set(['get', 'post', 'patch', 'put', 'delete', 'head', 'options']);
const operations = Object.entries(contract.paths).flatMap(([path, value]) => Object.entries(value)
  .filter(([method]) => methods.has(method)).map(([method, operation]) => ({ path, method, ...operation })));
const routeKey = operation => `${operation.method.toUpperCase()} ${operation.path}`;
const inventoryApp = buildApp();
let discoveredRoutes;
try { await inventoryApp.ready(); discoveredRoutes = new Set(routeInventory(inventoryApp)); }
finally { await inventoryApp.close(); }
// Captain-approved contract-first stage (#89). A route that exists in Fastify
// is always checked, even if its delivery marker has not yet been removed.
const pending = operations.filter(operation => operation['x-implementation-issue'] && !discoveredRoutes.has(routeKey(operation)));
const activeOperations = operations.filter(operation => !pending.includes(operation));
const resolve = ref => ref.slice(2).split('/').reduce((value, key) => value[key], contract);
const payload = { type: 'problem', categoryId: 'cross_department', description: 'Синтетическое обращение для проверки контракта.' };
const request = (app, method, url, body, user = 'manager-1', headers = {}) => app.inject({ method, url,
  headers: { 'x-demo-user': user, ...headers }, ...(body === undefined ? {} : { payload: body }) });
function validateResponse(operation, response) {
  let definition = operation.responses[String(response.statusCode)];
  assert.ok(definition, `${operation.operationId}: undocumented status ${response.statusCode}`);
  if (definition.$ref) definition = resolve(definition.$ref);
  const mediaType = String(response.headers['content-type']).split(';')[0].trim().toLowerCase();
  const schema = definition.content?.[mediaType]?.schema;
  assert.ok(schema, `${operation.operationId}: undocumented response content type ${mediaType}`);
  const validator = ajv.compile(schema.$ref ? { $ref: `contract${schema.$ref}` } : schema);
  const body = mediaType === 'application/json' ? response.json() : response.body;
  assert.ok(validator(body), `${operation.operationId} ${response.statusCode}: ${JSON.stringify(validator.errors)}`);
  if (mediaType === 'text/csv') {
    assert.match(response.headers['content-type'], /charset=utf-8/i);
    assert.ok(body.startsWith('\uFEFF'), `${operation.operationId}: CSV must retain its UTF-8 BOM`);
  }
}

const futureFixtures = {
  undoLastAction: { method: 'post', path: '/complaints/{complaintId}/undo', role: 'manager', params: { complaintId: 'fixture-complaint' } },
  listNotifications: { method: 'get', path: '/notifications', role: 'employee', query: { since: '2026-01-01T00:00:00Z' } },
  findSimilarComplaints: { method: 'get', path: '/complaints/similar', role: 'manager', query: { text: 'Не хватает параметров в заявке на оборудование.' } },
  suggestCategory: { method: 'get', path: '/complaints/suggest-category', role: 'employee', query: { text: 'Нужна понятная инструкция для обработки документов.' } },
  exportComplaints: { method: 'get', path: '/complaints/export', role: 'manager', query: { status: 'new' } },
  resetDemo: { method: 'post', path: '/demo/reset', role: 'admin' },
  getSummaryDigest: { method: 'get', path: '/summary/digest', role: 'manager' },
  getAnalyticsTrends: { method: 'get', path: '/analytics/trends', role: 'manager' },
};
const roleUsers = { employee: 'employee-1', manager: 'manager-1', admin: 'admin-1' };
function runFutureFixture(app, operationId, params = {}) {
  const fixture = futureFixtures[operationId];
  const values = { ...fixture.params, ...params };
  const path = fixture.path.replace(/\{([^}]+)\}/g, (_, name) => encodeURIComponent(values[name]));
  const query = new URLSearchParams(fixture.query).toString();
  return request(app, fixture.method.toUpperCase(), `${path}${query ? `?${query}` : ''}`, undefined, roleUsers[fixture.role]);
}
async function prepareUndo(app) {
  const created = await request(app, 'POST', '/complaints', payload, 'employee-1');
  assert.equal(created.statusCode, 201, `undo setup create: ${created.body}`);
  const id = created.json().id;
  const changed = await request(app, 'PATCH', `/complaints/${id}/status`, { status: 'in_review' }, 'manager-1');
  assert.equal(changed.statusCode, 200, `undo setup status: ${changed.body}`);
  assert.equal(changed.json().status, 'in_review');
  assert.equal(changed.json().history.at(-1).kind, 'status_changed');
  assert.equal(changed.json().history.at(-1).actor.id, 'manager-1');
  return id;
}
function prepareFixtureEnvironment(operationId, t) {
  const changes = operationId === 'resetDemo'
    ? { DEMO_RESET_ENABLED: 'true', PERSIST_FILE: undefined }
    : operationId === 'getSummaryDigest' ? { ANTHROPIC_API_KEY: undefined } : {};
  const original = Object.fromEntries(Object.keys(changes).map(name => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  for (const [name, value] of Object.entries(changes)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}

const scenarios = {
  translateComplaintText: async app => request(app, 'POST', '/complaints/complaint-1/translations', { field: 'description', targetLocale: 'en' }),
  getHealth: async app => app.inject({ url: '/health' }),
  getHealthReady: async app => app.inject({ url: '/health/ready' }),
  getSession: async app => request(app, 'GET', '/session', undefined, 'employee-1'),
  getReferenceData: async app => request(app, 'GET', '/reference-data'),
  createComplaint: async app => request(app, 'POST', '/complaints', payload, 'employee-1'),
  listComplaints: async app => request(app, 'GET', '/complaints'),
  getComplaint: async app => request(app, 'GET', '/complaints/complaint-1'),
  assignComplaint: async app => request(app, 'PATCH', '/complaints/complaint-1/assignment', { assigneeId: 'manager-2' }),
  changeComplaintStatus: async app => request(app, 'PATCH', '/complaints/complaint-1/status', { status: 'in_review' }),
  addComment: async app => request(app, 'POST', '/complaints/complaint-1/comments', { kind: 'comment', text: 'Синтетический комментарий.' }),
  getComplaintAdvice: async app => request(app, 'POST', '/complaints/complaint-1/advice'),
  recordDecision: async app => request(app, 'POST', '/complaints/complaint-1/decision', { outcome: 'rejected', explanation: 'Синтетическое обоснование.' }),
  getSummary: async app => request(app, 'GET', '/summary', undefined, 'admin-1'),
  recordFeedback: async app => request(app, 'POST', '/complaints/complaint-4/feedback', { understood: true, solved: true, comment: 'Спасибо.' }, 'employee-1'),
  listImprovements: async app => request(app, 'GET', '/improvements', undefined, 'employee-1'),
  getImpact: async app => request(app, 'GET', '/impact?days=30', undefined, 'manager-1'),
  listProblems: async app => request(app, 'GET', '/problems', undefined, 'admin-1'),
  createProblem: async app => request(app, 'POST', '/problems', { title: 'Общая проблема', plan: 'План.', complaintIds: ['complaint-1', 'complaint-2'] }, 'manager-1'),
  listDemoAccounts: async app => app.inject({ method: 'GET', url: '/demo-accounts' }),
  listAdminUsers: async app => request(app, 'GET', '/admin/users', undefined, 'admin-1'),
  createAdminUser: async app => request(app, 'POST', '/admin/users', { name: 'Новый участник', role: 'employee', departmentId: 'sales' }, 'admin-1'),
  updateAdminUser: async app => request(app, 'PATCH', '/admin/users/employee-2', { role: 'manager', active: true }, 'admin-1'),
  updateAdminCategory: async app => request(app, 'PATCH', '/admin/categories/training', { assigneeId: 'manager-1', dueInDays: 5 }, 'admin-1'),
  undoLastAction: async app => runFutureFixture(app, 'undoLastAction', { complaintId: await prepareUndo(app) }),
  listNotifications: async app => runFutureFixture(app, 'listNotifications'),
  findSimilarComplaints: async app => runFutureFixture(app, 'findSimilarComplaints'),
  suggestCategory: async app => runFutureFixture(app, 'suggestCategory'),
  exportComplaints: async app => runFutureFixture(app, 'exportComplaints'),
  getSummaryDigest: async app => runFutureFixture(app, 'getSummaryDigest'),
  getAnalyticsTrends: async app => runFutureFixture(app, 'getAnalyticsTrends'),
  resetDemo: async app => {
    const initialCount = app.store.list().length;
    const created = await request(app, 'POST', '/complaints', payload, 'employee-1');
    assert.equal(created.statusCode, 201);
    assert.equal(app.store.list().length, initialCount + 1);
    const response = await runFutureFixture(app, 'resetDemo');
    if (response.statusCode === 200) {
      assert.equal(response.json().loadedCount, initialCount);
      assert.equal(app.store.list().length, initialCount);
      assert.equal(app.store.get(created.json().id), undefined);
    }
    return response;
  },
};
const baselineOperationIds = new Set(['getHealth', 'getSession', 'getReferenceData', 'createComplaint',
  'listComplaints', 'getComplaint', 'assignComplaint', 'changeComplaintStatus', 'addComment', 'recordDecision', 'getSummary']);

test('#95 future success fixtures already satisfy the published request schemas and roles', () => {
  for (const operation of operations.filter(item => item['x-implementation-issue'])) {
    assert.ok(futureFixtures[operation.operationId], `Missing pending input fixture for ${operation.operationId}`);
  }
  for (const [operationId, fixture] of Object.entries(futureFixtures)) {
    const operation = operations.find(item => item.operationId === operationId);
    assert.ok(operation, `${operationId} must be in the contract`);
    assert.equal(fixture.method, operation.method); assert.equal(fixture.path, operation.path);
    assert.ok(operation['x-roles'].includes(fixture.role), `${operationId}: role is allowed`);
    assert.equal(operation.requestBody, undefined, `${operationId}: fixture sends no request body, as contracted`);
    const parameters = [...(contract.paths[operation.path].parameters ?? []), ...(operation.parameters ?? [])];
    for (const parameter of parameters) {
      const value = (parameter.in === 'path' ? fixture.params : fixture.query)?.[parameter.name];
      if (value === undefined && !parameter.required) continue;
      assert.notEqual(value, undefined, `${operationId}: missing ${parameter.name}`);
      const validator = ajv.compile(parameter.schema.$ref ? { $ref: `contract${parameter.schema.$ref}` } : parameter.schema);
      assert.ok(validator(value), `${operationId}/${parameter.name}: ${JSON.stringify(validator.errors)}`);
    }
    for (const name of Object.keys(fixture.query ?? {})) {
      assert.ok(parameters.some(parameter => parameter.in === 'query' && parameter.name === name), `${operationId}: unknown query ${name}`);
    }
  }
});

test('#95 undo preparation makes a real eligible manager action even before undo is implemented', async t => {
  const app = buildApp(); t.after(() => app.close());
  await prepareUndo(app);
});

test('#95 reset fixture prepares an isolated seed store before the endpoint is implemented', async t => {
  prepareFixtureEnvironment('resetDemo', t);
  assert.equal(process.env.DEMO_RESET_ENABLED, 'true');
  assert.equal(process.env.PERSIST_FILE, undefined);
  const app = buildApp(); t.after(() => app.close());
  assert.ok(app.store.list().length > 0);
  const created = await request(app, 'POST', '/complaints', payload, 'employee-1');
  assert.equal(created.statusCode, 201);
  const otherApp = buildApp(); t.after(() => otherApp.close());
  assert.equal(otherApp.store.get(created.json().id), undefined);
});

test('#95 CSV responses validate their declared string schema and media type without parsing JSON', () => {
  const operation = operations.find(item => item.operationId === 'exportComplaints');
  const example = operation.responses['200'].content['text/csv'].example;
  const response = { statusCode: 200, headers: { 'content-type': 'text/csv; charset=utf-8' }, body: example };
  validateResponse(operation, response);
  assert.throws(() => validateResponse(operation, { ...response, body: {} }), /exportComplaints/);
  assert.throws(() => validateResponse(operation, { ...response, headers: { 'content-type': 'text/plain' } }), /content type/);
});

test('#95 pending contract operations are explicit and separate from live response coverage', t => {
  for (const operation of operations.filter(item => Object.hasOwn(item, 'x-implementation-issue'))) {
    assert.ok(Number.isInteger(operation['x-implementation-issue']) && operation['x-implementation-issue'] > 0,
      `${operation.operationId}: invalid implementation issue`);
    assert.ok(!baselineOperationIds.has(operation.operationId), `${operation.operationId}: an existing operation must not become pending`);
  }
  t.diagnostic(`Pending implementation (${pending.length}): ${pending.map(operation => `${routeKey(operation)} -> #${operation['x-implementation-issue']}`).join('; ') || 'none'}`);
});

for (const operation of activeOperations) {
  test(`#95 successful ${operation.method.toUpperCase()} ${operation.path} matches its response schema`, async t => {
    prepareFixtureEnvironment(operation.operationId, t);
    const app = buildApp({}, { translator: { enabled: true, translate: async () => 'translated fixture' } }); t.after(() => app.close());
    assert.ok(scenarios[operation.operationId], `Missing success scenario for ${operation.operationId} (${operation.method} ${operation.path})`);
    const response = await scenarios[operation.operationId](app);
    assert.ok(response.statusCode >= 200 && response.statusCode < 300,
      `${operation.operationId}: expected successful response, got ${response.statusCode}: ${response.body}`);
    validateResponse(operation, response);
  });
}

test('#95 documented client error codes have real requests and contract-valid error bodies', async t => {
  const app = buildApp({ bodyLimit: 1024 }); t.after(() => app.close());
  const documented = new Set(activeOperations.flatMap(operation => Object.keys(operation.responses).filter(code => /^4\d\d$/.test(code))));
  const cases = [
    ['createComplaint', 400, () => request(app, 'POST', '/complaints', '{', 'employee-1', { 'content-type': 'application/json' })],
    ['getSession', 401, () => request(app, 'GET', '/session', undefined, 'unknown')],
    ['getSummary', 403, () => request(app, 'GET', '/summary', undefined, 'employee-1')],
    ['getComplaint', 404, () => request(app, 'GET', '/complaints/unknown')],
    ['changeComplaintStatus', 409, () => request(app, 'PATCH', '/complaints/complaint-1/status', { status: 'in_progress' })],
    ['createComplaint', 413, () => request(app, 'POST', '/complaints', { ...payload, description: 'x'.repeat(2000) }, 'employee-1')],
    ['createComplaint', 415, () => request(app, 'POST', '/complaints', 'text', 'employee-1', { 'content-type': 'text/plain' })],
    ['createComplaint', 422, () => request(app, 'POST', '/complaints', { ...payload, description: '   ' }, 'employee-1')],
  ];
  let limitedApp;
  if (documented.has('429')) {
    const original = { NODE_ENV: process.env.NODE_ENV, RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX };
    try {
      process.env.NODE_ENV = 'production'; process.env.RATE_LIMIT_MAX = '1';
      limitedApp = buildApp();
    } finally {
      for (const [name, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
    t.after(() => limitedApp.close());
    assert.equal((await request(limitedApp, 'POST', '/complaints', payload, 'employee-1')).statusCode, 201);
    cases.push(['createComplaint', 429, () => request(limitedApp, 'POST', '/complaints', payload, 'employee-1')]);
  }
  assert.deepEqual([...documented].sort(), [...new Set(cases.map(([, status]) => String(status)))].sort(),
    'Every documented client error needs a real provoking request');
  for (const [operationId, status, run] of cases) {
    const before = app.store.list();
    const beforeLimited = limitedApp?.store.list();
    const response = await run();
    assert.equal(response.statusCode, status, operationId);
    validateResponse(operations.find(operation => operation.operationId === operationId), response);
    assert.deepEqual(app.store.list(), before, `${status} must not change stored data`);
    assert.deepEqual(limitedApp?.store.list(), beforeLimited, `${status} must not change rate-limited stored data`);
  }
});

// printRoutes(commonPrefix:false) is the public Fastify route inventory. Resolve
// its tree prefixes rather than inspecting application source or private fields.
function routeInventory(app) {
  const stack = [], result = [];
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const match = line.match(/^([ │]*)(?:├── |└── )(\S+) \(([^)]+)\)$/);
    if (!match) continue;
    const depth = match[1].length / 4;
    stack.length = depth;
    const path = `${depth ? stack[depth - 1] : ''}${match[2]}`;
    stack[depth] = path;
    for (const method of match[3].split(', ')) {
      // Fastify automatically exposes HEAD for GET, without a separate handler.
      if (method !== 'HEAD' || !match[3].split(', ').includes('GET')) result.push(`${method} ${path.replace(/:([^/]+)/g, '{$1}')}`);
    }
  }
  assert.ok(result.length, 'Fastify route inventory is empty or has an unknown format');
  return result;
}

test('#95 Fastify routes and all contract operations match in both directions', async t => {
  const app = buildApp(); t.after(() => app.close()); await app.ready();
  const actual = new Set(routeInventory(app));
  const expected = new Set(activeOperations.map(routeKey));
  const missing = [...expected].filter(operation => !actual.has(operation));
  const undocumented = [...actual].filter(operation => !expected.has(operation));
  assert.deepEqual({ missing, undocumented }, { missing: [], undocumented: [] },
    `Route mismatch: missing in Fastify=${JSON.stringify(missing)}; undocumented in contract=${JSON.stringify(undocumented)}`);
});
