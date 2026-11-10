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
  const schema = definition.content?.['application/json']?.schema;
  assert.ok(schema, `${operation.operationId}: missing JSON response schema`);
  const validator = ajv.compile(schema.$ref ? { $ref: `contract${schema.$ref}` } : schema);
  assert.ok(validator(response.json()), `${operation.operationId} ${response.statusCode}: ${JSON.stringify(validator.errors)}`);
}

const scenarios = {
  getHealth: async app => app.inject({ url: '/health' }),
  getSession: async app => request(app, 'GET', '/session', undefined, 'employee-1'),
  getReferenceData: async app => request(app, 'GET', '/reference-data'),
  createComplaint: async app => request(app, 'POST', '/complaints', payload, 'employee-1'),
  listComplaints: async app => request(app, 'GET', '/complaints'),
  getComplaint: async app => request(app, 'GET', '/complaints/complaint-1'),
  assignComplaint: async app => request(app, 'PATCH', '/complaints/complaint-1/assignment', { assigneeId: 'manager-2' }),
  changeComplaintStatus: async app => request(app, 'PATCH', '/complaints/complaint-1/status', { status: 'in_review' }),
  addComment: async app => request(app, 'POST', '/complaints/complaint-1/comments', { kind: 'comment', text: 'Синтетический комментарий.' }),
  recordDecision: async app => request(app, 'POST', '/complaints/complaint-1/decision', { outcome: 'rejected', explanation: 'Синтетическое обоснование.' }),
  getSummary: async app => request(app, 'GET', '/summary', undefined, 'admin-1'),
};
const baselineOperationIds = new Set(['getHealth', 'getSession', 'getReferenceData', 'createComplaint',
  'listComplaints', 'getComplaint', 'assignComplaint', 'changeComplaintStatus', 'addComment', 'recordDecision', 'getSummary']);

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
    const app = buildApp(); t.after(() => app.close());
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
