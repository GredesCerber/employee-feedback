import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const methods = new Set(['get', 'post', 'patch', 'put', 'delete', 'head', 'options']);
const operations = Object.entries(contract.paths).flatMap(([path, value]) => Object.entries(value)
  .filter(([method]) => methods.has(method)).map(([method, operation]) => ({ path, method, ...operation })))
  // #89 captain-approved contract-first stage: delivery issues own new routes.
  // Existing routes remain covered; #89 checks that none acquires this marker.
  .filter(operation => !operation['x-implementation-issue']);
const identities = { employee: 'employee-1', manager: 'manager-1', admin: 'admin-1', unauthenticated: null };
const fixtures = {
  getHealth: {}, getHealthReady: {}, getSession: {}, getReferenceData: {}, listComplaints: {}, getComplaint: {}, getSummary: {},
  createComplaint: { payload: { type: 'problem', categoryId: 'cross_department', description: 'Синтетическое обращение.' } },
  assignComplaint: { payload: { assigneeId: 'manager-2' } },
  changeComplaintStatus: { payload: { status: 'in_review' } },
  addComment: { payload: { kind: 'comment', text: 'Синтетическое дополнение.' } },
  translateComplaintText: { payload: { field: 'description', targetLocale: 'en' } },
  getComplaintAdvice: {},
  recordDecision: { payload: { outcome: 'rejected', explanation: 'Синтетическое обоснование.' } },
  // Feedback needs a finished complaint of employee-1 (seed A-004, implemented).
  recordFeedback: { payload: { understood: true, solved: false }, complaintId: 'complaint-4' },
  listImprovements: {}, getImpact: {}, listProblems: {},
  listDemoAccounts: {}, listAdminUsers: {},
  createAdminUser: { payload: { name: 'Новый участник', role: 'employee', departmentId: 'sales' } },
  updateAdminUser: { payload: { role: 'manager' }, userId: 'employee-2' },
  updateAdminCategory: { payload: { dueInDays: 5 }, categoryId: 'training' },
  createProblem: { payload: { title: 'Общая проблема', complaintIds: ['complaint-1', 'complaint-2'] } },
};

for (const operation of operations) for (const [role, user] of Object.entries(identities)) {
  test(`#96 ${role} / ${operation.method.toUpperCase()} ${operation.path} follows x-roles`, async t => {
    const app = buildApp({}, { translator: { enabled: true, translate: async () => 'translated fixture' } }); t.after(() => app.close());
    assert.ok(Object.hasOwn(fixtures, operation.operationId), `Missing role-matrix fixture: ${role}/${operation.operationId}`);
    const publicHealth = ['getHealth', 'getHealthReady', 'listDemoAccounts'].includes(operation.operationId);
    const allowed = publicHealth || operation['x-roles'].includes(role);
    const { complaintId = 'complaint-1', userId = 'employee-2', categoryId = 'training', ...input } = fixtures[operation.operationId];
    const response = await app.inject({ method: operation.method.toUpperCase(),
      url: operation.path.replace('{complaintId}', complaintId).replace('{userId}', userId).replace('{categoryId}', categoryId),
      headers: user ? { 'x-demo-user': user } : {}, ...input });
    // Contract and access.md distinguish missing identity (401) from a known
    // role lacking permission (403). Using 403 for both would hide that rule.
    const expected = user === null && !publicHealth ? 401 : allowed ? Number(Object.keys(operation.responses).find(code => /^2\d\d$/.test(code))) : 403;
    assert.equal(response.statusCode, expected,
      `${role}/${operation.operationId}: expected ${expected}, actual ${response.statusCode}; ${response.body}`);
    if (expected >= 400) assert.equal(response.json().code, expected === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  });
}

test('#96 employee cannot read foreign detail, author data, list counts or filtered records', async t => {
  const app = buildApp(); t.after(() => app.close());
  const read = url => app.inject({ url, headers: { 'x-demo-user': 'employee-2' } });
  const foreign = await read('/complaints/complaint-1');
  const missing = await read('/complaints/nonexistent');
  assert.equal(foreign.statusCode, 404);
  const { requestId: foreignId, ...foreignBody } = foreign.json();
  const { requestId: missingId, ...missingBody } = missing.json();
  assert.deepEqual(foreignBody, missingBody);
  assert.ok(foreignId && missingId);
  const list = (await read('/complaints?limit=100')).json();
  assert.equal(list.total, 4);
  assert.equal(list.items.length, 4);
  assert.ok(list.items.every(item => item.author.id === 'employee-2'));
  assert.ok(list.items.every(item => item.departmentId === 'accounting'));
  const filtered = (await read('/complaints?departmentId=procurement')).json();
  assert.deepEqual(filtered.items, []); assert.equal(filtered.total, 0);
  const comments = await app.inject({ method: 'POST', url: '/complaints/complaint-1/comments',
    headers: { 'x-demo-user': 'employee-2' }, payload: { kind: 'comment', text: 'Чужое.' } });
  assert.equal(comments.statusCode, 404);
});

test('#96 manager sees every department and unassigned queue as access.md explicitly permits', async t => {
  const app = buildApp(); t.after(() => app.close());
  const access = readFileSync(new URL('../../api/concept/access.md', import.meta.url), 'utf8');
  assert.match(access, /Нет разграничения по подразделениям: руководитель видит все обращения/);
  const headers = { 'x-demo-user': 'manager-1' };
  const list = (await app.inject({ url: '/complaints?limit=100', headers })).json();
  assert.equal(list.total, 20);
  assert.equal(new Set(list.items.map(item => item.departmentId)).size, 6);
  assert.equal((await app.inject({ url: '/complaints/complaint-5', headers })).statusCode, 200);
  const created = await app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-2' },
    payload: { type: 'problem', categoryId: 'no_rule_demo', description: 'Обращение без ответственного.' } });
  assert.equal(created.statusCode, 201);
  const queue = (await app.inject({ url: '/complaints?queue=unassigned', headers })).json();
  assert.equal(queue.total, 1);
  assert.equal(queue.items[0].id, created.json().id);
  assert.equal(queue.items[0].departmentId, 'accounting');
});
