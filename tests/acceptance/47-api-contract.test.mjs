import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// JSON is a YAML 1.2 subset: keeping the contract in this syntax lets the
// acceptance suite run on a clean Node installation without network access.
const read = () => JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const operations = (api) => Object.entries(api.paths).flatMap(([path, item]) =>
  Object.entries(item).filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
    .map(([method, op]) => ({ path, method, ...op })));
const resolve = (api, ref) => ref.slice(2).split('/').reduce((node, key) => node?.[key], api);

test('R1-R7: OpenAPI 3.1 has resolvable references, unique operations and response schemas', () => {
  const api = read();
  assert.match(api.openapi, /^3\.1\./);
  assert.ok(api.info.title && api.info.version);
  const ids = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'), 'contract must be self-contained');
      assert.ok(resolve(api, value.$ref), `unresolved ${value.$ref}`);
    }
    Object.values(value).forEach(walk);
  }
  walk(api);
  for (const op of operations(api)) {
    assert.ok(op.operationId && !ids.has(op.operationId));
    ids.add(op.operationId);
    const success = Object.entries(op.responses).filter(([code]) => /^2\d\d$/.test(code));
    assert.ok(success.length, op.operationId);
    for (const [, response] of success) {
      if (op.operationId === 'exportComplaints') {
        assert.equal(op.path, '/complaints/export');
        assert.equal(op.method, 'get');
        assert.equal(response.content?.['text/csv']?.schema?.type, 'string');
      } else assert.ok(response.content?.['application/json']?.schema);
    }
    for (const name of op.path.matchAll(/\{([^}]+)\}/g)) {
      const params = [...(api.paths[op.path].parameters ?? []), ...(op.parameters ?? [])]
        .map(p => p.$ref ? resolve(api, p.$ref) : p);
      assert.ok(params.some(p => p.in === 'path' && p.name === name[1] && p.required));
    }
  }
});

test('R1-R4: create, detail, comments, status, assignment and decision cover the demo', () => {
  const api = read();
  for (const [path, method] of [
    ['/complaints', 'post'], ['/complaints/{complaintId}', 'get'],
    ['/complaints/{complaintId}/comments', 'post'],
    ['/complaints/{complaintId}/status', 'patch'],
    ['/complaints/{complaintId}/assignment', 'patch'],
    ['/complaints/{complaintId}/decision', 'post'],
  ]) assert.ok(api.paths[path]?.[method], `${method} ${path}`);
  assert.ok(api.paths['/complaints'].post.responses['201']);
  const schemas = api.components.schemas;
  for (const field of ['type', 'categoryId', 'description']) assert.ok(schemas.CreateComplaint.required.includes(field));
  assert.ok(schemas.CreateComplaint.properties.proposedSolution);
  assert.ok(schemas.CreateComplaint.properties.attachments);
  for (const field of ['number', 'status', 'assignee', 'routing', 'dueAt', 'history', 'comments', 'decision', 'nextAction']) {
    assert.ok(schemas.Complaint.required.includes(field), field);
  }
  assert.ok(schemas.Complaint.properties.assignee.oneOf.some(s => s.type === 'null'));
  assert.ok(schemas.Routing.properties.queue.enum.includes('unassigned'));
  assert.ok(schemas.DecisionInput.required.includes('explanation'));
  assert.ok(schemas.DecisionInput.properties.explanation.minLength >= 1);
  assert.ok(api.paths['/complaints/{complaintId}/status'].patch.responses['409']);
  assert.ok(api['x-status-transitions'].new.includes('in_review'));
  assert.deepEqual(api['x-status-transitions'].rejected, []);
});

test('R6-R7: list filters and summary metrics support demo steps five and six', () => {
  const api = read();
  const parameters = api.paths['/complaints'].get.parameters.map(p => p.name);
  for (const field of ['departmentId', 'categoryId', 'status', 'dueBefore', 'dueAfter', 'overdue', 'queue', 'q', 'limit', 'offset']) {
    assert.ok(parameters.includes(field), field);
  }
  assert.ok(api.paths['/summary'].get);
  const summary = api.components.schemas.Summary;
  for (const field of ['total', 'byType', 'closedShare', 'averageFirstResponseHours', 'recurringTopics', 'generatedAt']) {
    assert.ok(summary.required.includes(field), field);
    assert.ok(summary.properties[field].description, `metric definition: ${field}`);
  }
});

test('R5 and demo coverage: all six steps, role permissions and structured errors are explicit', () => {
  const api = read();
  const covered = new Set();
  for (const op of operations(api)) {
    for (const step of op['x-demo-steps']) covered.add(step);
    assert.ok(op['x-roles'].length && op['x-roles'].every(role => ['employee', 'manager', 'admin'].includes(role)));
    assert.ok(op.description.length > 30, `access semantics: ${op.operationId}`);
    const publicHealth = ['getHealth', 'getHealthReady'].includes(op.operationId);
    // Login screen has no identity yet: the list of selectable accounts is public (#375).
    if (op.operationId === 'listDemoAccounts') {
      assert.deepEqual(op.security, []);
      continue;
    }
    if (publicHealth) {
      assert.equal(op.path, op.operationId === 'getHealth' ? '/health' : '/health/ready');
      assert.equal(op.method, 'get');
      assert.deepEqual(op.security, []);
    } else assert.ok((op.security ?? api.security).length, `authentication: ${op.operationId}`);
    for (const code of publicHealth ? ['500'] : ['401', '403', '422', '500']) {
      const response = op.responses[code];
      assert.ok(response, `${op.operationId}: ${code}`);
      const resolved = response.$ref ? resolve(api, response.$ref) : response;
      assert.equal(resolved.content['application/json'].schema.$ref, '#/components/schemas/Error');
    }
  }
  assert.deepEqual([...covered].sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(api.paths['/summary'].get['x-roles'], ['admin']);
  assert.deepEqual(api.components.schemas.Error.required, ['code', 'message']);
});
