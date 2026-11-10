import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const api = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const ref = (name) => `#/components/schemas/${name}`;
const resolve = (value) => value?.$ref ? value.$ref.slice(2).split('/').reduce((node, key) => node[key], api) : value;
const operations = Object.values(api.paths).flatMap((item) => ['get', 'post', 'patch'].filter((method) => item[method]).map((method) => ({ method, ...item[method] })));
const expected = [
  ['/complaints/{complaintId}/undo', 'post', 'undoLastAction', ['manager']],
  ['/notifications', 'get', 'listNotifications', ['employee', 'manager']],
  ['/complaints/similar', 'get', 'findSimilarComplaints', ['employee', 'manager', 'admin']],
  ['/complaints/suggest-category', 'get', 'suggestCategory', ['employee', 'manager', 'admin']],
  ['/complaints/export', 'get', 'exportComplaints', ['manager', 'admin']],
  ['/demo/reset', 'post', 'resetDemo', ['admin']],
];

test('#89 новые операции имеют явные роли, ошибки, схемы и публичный health', () => {
  for (const [path, method, id, roles] of expected) {
    const operation = api.paths[path]?.[method];
    assert.ok(operation, `${method} ${path}`);
    assert.equal(operation.operationId, id);
    assert.deepEqual(operation['x-roles'], roles);
    assert.deepEqual(operation.security, [{ DemoIdentity: [] }]);
    assert.ok(operation.description.length >= 30);
    assert.ok(operation.responses['200']);
    for (const code of ['400', '401', '403', '422', '500']) {
      assert.equal(resolve(operation.responses[code])?.content?.['application/json']?.schema?.$ref, ref('Error'), `${id}: ${code}`);
    }
  }
  const health = api.paths['/health']?.get;
  assert.ok(health);
  assert.equal(health.operationId, 'getHealth');
  assert.deepEqual(health.security, [], 'health не требует демонстрационной личности');
  assert.equal(health.responses['200'].content['application/json'].schema.$ref, ref('Health'));
});

test('#89 все POST/PATCH описывают 429, Retry-After и общую ошибку', () => {
  for (const operation of operations.filter((op) => ['post', 'patch'].includes(op.method))) {
    const response = resolve(operation.responses['429']);
    assert.ok(response, operation.operationId);
    assert.equal(response.content['application/json'].schema.$ref, ref('Error'));
    assert.equal(response.headers['Retry-After'].schema.type, 'integer');
    assert.ok(response.headers['Retry-After'].schema.minimum >= 1);
  }
  for (const code of ['RATE_LIMITED', 'UNDO_EXPIRED', 'NOTHING_TO_UNDO']) {
    assert.ok(api.components.schemas.Error.properties.code.enum.includes(code));
  }
});

test('#89 q ищет все слова, сохраняет ограничения списка и CSV повторяет фильтры без пагинации', () => {
  const list = api.paths['/complaints'].get;
  const q = list.parameters.find((parameter) => parameter.name === 'q');
  assert.equal(q.required, false);
  assert.deepEqual(q.schema, { type: 'string', minLength: 1, maxLength: 200 });
  for (const pattern of [/AND/, /case.insensitive/i, /ё/, /comments/, /number/, /proposedSolution/]) {
    assert.match(`${q.description} ${list.description}`, pattern);
  }
  assert.deepEqual(list.parameters.map((p) => p.name), ['departmentId', 'categoryId', 'status', 'type', 'dueAfter', 'dueBefore', 'overdue', 'queue', 'q', 'limit', 'offset']);
  assert.deepEqual(list.parameters.find((p) => p.name === 'limit').schema, { type: 'integer', minimum: 1, maximum: 100, default: 20 });
  assert.deepEqual(list.parameters.find((p) => p.name === 'offset').schema, { type: 'integer', minimum: 0, default: 0 });
  const csv = api.paths['/complaints/export'].get;
  assert.deepEqual(csv.parameters, list.parameters.filter((p) => !['limit', 'offset'].includes(p.name)));
  assert.equal(csv.responses['200'].content['text/csv'].schema.type, 'string');
  assert.equal(csv.responses['200'].content['application/json'], undefined, 'CSV не маскируется фиктивным JSON');
  for (const term of ['BOM', 'RFC 4180', 'formula', 'anonymous']) assert.ok(csv.description.includes(term));
});

test('#89 анонимность добавочна, а публичный actor запрещает идентификаторы', () => {
  const schemas = api.components.schemas;
  assert.deepEqual(schemas.CreateComplaint.required, ['type', 'categoryId', 'description']);
  assert.equal(schemas.CreateComplaint.properties.anonymous.type, 'boolean');
  assert.equal(schemas.CreateComplaint.properties.anonymous.default, false);
  assert.equal(schemas.Complaint.properties.anonymous.type, 'boolean');
  assert.ok(!schemas.Complaint.required.includes('anonymous'));
  for (const owner of [schemas.Complaint.properties.author, schemas.Comment.properties.author, schemas.HistoryEvent.properties.actor]) {
    assert.ok(owner.oneOf.some((option) => option.$ref === ref('User')));
    assert.ok(owner.oneOf.some((option) => option.$ref === ref('AnonymousActor')));
  }
  assert.ok(schemas.HistoryEvent.properties.actor.oneOf.some((option) => option.type === 'null'));
  assert.deepEqual(schemas.User.required, ['id', 'name', 'role', 'departmentId']);
  const require = createRequire(new URL('../../api/package.json', import.meta.url));
  const Ajv = require('ajv');
  const validate = new Ajv({ strict: false }).compile(schemas.AnonymousActor);
  assert.ok(validate({ name: 'Аноним' }));
  assert.ok(validate({ name: 'Автор (аноним)' }));
  for (const value of [{ name: 'Реальное имя' }, { name: 'Аноним', id: 'employee-1' }, { name: 'Аноним', departmentId: 'procurement' }]) {
    assert.equal(validate(value), false, JSON.stringify(value));
  }
});

test('#89 новые метрики необязательны и определяют пустые наборы', () => {
  const summary = api.components.schemas.Summary;
  assert.deepEqual(summary.required, ['total', 'byType', 'closedCount', 'closedShare', 'averageFirstResponseHours', 'respondedCount', 'recurringTopics', 'generatedAt']);
  for (const field of ['byDepartment', 'avgResolutionHoursByCategory', 'overdueCount']) {
    assert.ok(summary.properties[field]?.description.length > 30, field);
    assert.ok(!summary.required.includes(field));
  }
  assert.equal(summary.properties.overdueCount.minimum, 0);
  const resolution = resolve(summary.properties.avgResolutionHoursByCategory.items);
  assert.deepEqual(resolution.properties.averageResolutionHours.type, ['number', 'null']);
  assert.match(resolution.properties.averageResolutionHours.description, /null/);
});

test('#89 контракт уточняет окно отката, уведомления, похожие обращения и сброс', () => {
  const undo = api.paths['/complaints/{complaintId}/undo'].post;
  assert.ok(undo.responses['409']);
  for (const term of ['UNDO_WINDOW_S', '600', 'NOTHING_TO_UNDO', 'UNDO_EXPIRED', 'firstResponseAt', 'dueAt']) assert.ok(undo.description.includes(term), term);
  assert.ok(api.components.schemas.HistoryEvent.properties.kind.enum.includes('undone'));
  for (const field of ['canUndo', 'undoExpiresAt']) assert.ok(!api.components.schemas.Complaint.required.includes(field));
  const notifications = api.paths['/notifications'].get;
  assert.ok(notifications.parameters.some((p) => p.name === 'since' && p.schema.format === 'date-time'));
  assert.equal(api.components.schemas.Notification.properties.simulated.const, true);
  assert.equal(api.components.schemas.Notification.properties.disclaimer.const, 'Имитация: в промышленной версии email / Битрикс24');
  const score = api.components.schemas.SimilarComplaint.properties.score;
  assert.equal(score.minimum, 0); assert.equal(score.maximum, 1);
  assert.match(api.paths['/complaints/similar'].get.description, /shorter than 10/);
  assert.match(api.paths['/demo/reset'].post.description, /DEMO_RESET_ENABLED=false/);
  assert.ok(api.paths['/demo/reset'].post.responses['404']);
  for (const value of ['demo-fixture', 'none']) assert.ok(api.components.schemas.CategorySuggestion.properties.source.enum.includes(value));
});

test('#89 схемы валидируют старые ответы и новые примеры без утечки автора', async (t) => {
  const require = createRequire(new URL('../../api/package.json', import.meta.url));
  const Ajv = require('ajv/dist/2020.js').default;
  const ajv = new Ajv({ strict: false, allErrors: true });
  require('ajv-formats').default(ajv);
  ajv.addSchema(api, 'contract');
  const validate = (name, value) => {
    const check = ajv.compile({ $ref: `contract${ref(name)}` });
    assert.ok(check(value), `${name}: ${JSON.stringify(check.errors)}`);
  };
  const { buildApp } = await import('../../api/dist/app.js');
  const app = buildApp();
  t.after(() => app.close());
  for (const [path, name, user] of [['/health', 'Health', null], ['/complaints/complaint-1', 'Complaint', 'manager-1'], ['/summary', 'Summary', 'admin-1']]) {
    const response = await app.inject({ url: path, headers: user ? { 'x-demo-user': user } : {} });
    assert.equal(response.statusCode, 200);
    validate(name, response.json());
  }
  validate('NotificationList', {
    items: [{ id: 'event-1', kind: 'clarification_requested', complaintId: 'complaint-1', complaintNumber: 'A-001',
      createdAt: '2026-11-10T09:00:00Z', message: 'Уточните описание.', href: '/my/complaint-1', simulated: true,
      disclaimer: 'Имитация: в промышленной версии email / Битрикс24' }],
    unreadCount: 1, generatedAt: '2026-11-10T09:01:00Z',
  });
  const similar = { id: 'complaint-1', number: 'A-001', categoryId: 'cross_department', categoryName: 'Межотдельное взаимодействие', status: 'new', score: 0.8 };
  validate('SimilarComplaints', { items: [similar] });
  const checkSimilar = ajv.compile({ $ref: `contract${ref('SimilarComplaint')}` });
  assert.equal(checkSimilar({ ...similar, author: { id: 'employee-2', name: 'Скрытый автор' } }), false);
  validate('CategorySuggestion', { category: null, source: 'none' });
  validate('CategorySuggestion', { category: { id: 'cross_department', name: 'Межотдельное взаимодействие' }, source: 'demo-fixture' });
  validate('DepartmentSummary', { departmentId: 'procurement', departmentName: 'Закупки', count: 0, closedCount: 0, closedShare: 0 });
  validate('CategoryResolution', { categoryId: 'cross_department', categoryName: 'Межотдельное взаимодействие', closedCount: 0, averageResolutionHours: null });
  validate('DemoResetResult', { loadedCount: 20 });
  for (const code of ['RATE_LIMITED', 'UNDO_EXPIRED', 'NOTHING_TO_UNDO']) validate('Error', { code, message: 'Операция недоступна.' });
});
