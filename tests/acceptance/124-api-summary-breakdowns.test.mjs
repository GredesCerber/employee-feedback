import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false });
requireApi('ajv-formats').default(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8')), 'contract');
const validSummary = ajv.compile({ $ref: 'contract#/components/schemas/Summary' });
const instant = new Date('2026-11-10T12:00:00Z');

function setup(t) {
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  const previous = process.env.PERSIST_FILE;
  delete process.env.PERSIST_FILE;
  t.after(() => previous === undefined ? delete process.env.PERSIST_FILE : process.env.PERSIST_FILE = previous);
  const app = buildApp();
  t.after(() => app.close());
  return app;
}
async function summary(app) {
  const response = await app.inject({ url: '/summary', headers: { 'x-demo-user': 'admin-1' } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.ok(validSummary(body), JSON.stringify(validSummary.errors));
  return body;
}

test('#124 seed summary includes every department/category and agrees with a hand-counted baseline', async t => {
  const app = setup(t);
  const result = await summary(app);
  // A-005..008: 1/4; A-017..018: 2/2; A-003: 0/1;
  // A-001,002,004,020: 1/4; A-013..016,019: 0/5; A-009..012: 0/4.
  assert.deepEqual(result.byDepartment, [
    { departmentId: 'accounting', departmentName: 'Бухгалтерия', count: 4, closedCount: 1, closedShare: 0.25 },
    { departmentId: 'administration', departmentName: 'Администрация', count: 2, closedCount: 2, closedShare: 1 },
    { departmentId: 'engineering', departmentName: 'Проектирование', count: 1, closedCount: 0, closedShare: 0 },
    { departmentId: 'procurement', departmentName: 'Закупки', count: 4, closedCount: 1, closedShare: 0.25 },
    { departmentId: 'projects', departmentName: 'Проекты', count: 5, closedCount: 0, closedShare: 0 },
    { departmentId: 'sales', departmentName: 'Продажи', count: 4, closedCount: 0, closedShare: 0 },
  ]);
  const completed = { environment: 2, mentoring: 1, training: 1 };
  assert.deepEqual(result.avgResolutionHoursByCategory.map(({ categoryId, closedCount, averageResolutionHours }) =>
    ({ categoryId, closedCount, averageResolutionHours })), [
    'catalog', 'communication', 'contracts', 'cross_department', 'document_storage', 'documents',
    'environment', 'it', 'mentoring', 'no_rule_demo', 'projects', 'regulations', 'resources',
    'responsiveness', 'results', 'task_definition', 'tasks', 'training', 'transparency',
  ].map(categoryId => ({ categoryId, closedCount: completed[categoryId] ?? 0,
    averageResolutionHours: completed[categoryId] ? 24 : null })));
  for (const item of result.avgResolutionHoursByCategory) {
    assert.equal(item.categoryName, app.store.referenceData.categories.find(category => category.id === item.categoryId).name);
  }
  assert.equal(result.overdueCount, 16); // All 20 deadlines precede now; 4 terminal records are excluded.
  assert.deepEqual(Object.fromEntries(Object.entries(result).filter(([key]) =>
    !['byDepartment', 'avgResolutionHoursByCategory', 'overdueCount'].includes(key))), {
    total: 20, byType: [{ type: 'problem', count: 9 }, { type: 'suggestion', count: 10 }, { type: 'praise', count: 1 }],
    closedCount: 4, closedShare: 0.2, averageFirstResponseHours: 1, respondedCount: 15,
    recurringTopics: [
      { categoryId: 'environment', categoryName: 'Корпоративная среда', count: 2 },
      { categoryId: 'training', categoryName: 'Обучение', count: 2 },
    ], generatedAt: instant.toISOString(),
  });
  for (const user of ['employee-1', 'manager-1']) {
    assert.equal((await app.inject({ url: '/summary', headers: { 'x-demo-user': user } })).statusCode, 403);
  }
});

test('#124 resolution uses only terminal records with a close time, while overdue includes unassigned and excludes the exact boundary', async t => {
  const app = setup(t), sample = app.store.list()[0];
  const make = (index, changes) => ({ ...structuredClone(sample), id: `sample-${index}`, number: `A-${100 + index}`,
    departmentId: 'procurement', categoryId: 'training', createdAt: '2026-11-10T00:00:00Z',
    dueAt: '2026-11-10T11:00:00Z', firstResponseAt: null, closedAt: null, overdue: false, ...changes });
  const records = [
    make(1, { status: 'implemented', closedAt: '2026-11-10T02:00:00Z' }),
    make(2, { status: 'rejected', closedAt: '2026-11-10T06:00:00Z' }),
    make(3, { status: 'closed', closedAt: null }),
    make(4, { status: 'new', assignee: null, routing: { queue: 'unassigned', reason: 'no_rule' } }),
    make(5, { status: 'in_progress', dueAt: instant.toISOString(), closedAt: '2026-11-10T11:00:00Z', overdue: true }),
  ];
  const before = structuredClone(records);
  t.mock.method(app.store, 'list', () => records);
  const result = await summary(app);
  assert.equal(result.overdueCount, 1);
  assert.deepEqual(result.avgResolutionHoursByCategory.find(item => item.categoryId === 'training'),
    { categoryId: 'training', categoryName: 'Обучение', closedCount: 2, averageResolutionHours: 4 });
  assert.deepEqual(result.byDepartment.find(item => item.departmentId === 'procurement'),
    { departmentId: 'procurement', departmentName: 'Закупки', count: 5, closedCount: 3, closedShare: 0.6 });
  t.mock.timers.setTime(instant.getTime() + 1);
  assert.equal((await summary(app)).overdueCount, 2);
  assert.deepEqual(records, before, 'Reading analytics must not mutate source records or cached overdue flags');
});

test('#124 empty storage keeps known zero-count groups and null averages without NaN', async t => {
  const app = setup(t);
  t.mock.method(app.store, 'list', () => []);
  const result = await summary(app);
  assert.equal(result.total, 0); assert.equal(result.overdueCount, 0);
  assert.equal(result.closedCount, 0); assert.equal(result.closedShare, 0);
  assert.equal(result.averageFirstResponseHours, null); assert.equal(result.respondedCount, 0);
  assert.deepEqual(result.recurringTopics, []);
  assert.deepEqual(result.byType.map(item => item.count), [0, 0, 0]);
  assert.deepEqual(result.byDepartment.map(item => item.departmentId), app.store.referenceData.departments.map(item => item.id).sort());
  assert.ok(result.byDepartment.every(item => item.count === 0 && item.closedCount === 0 && item.closedShare === 0));
  assert.deepEqual(result.avgResolutionHoursByCategory.map(item => item.categoryId), app.store.referenceData.categories.map(item => item.id).sort());
  assert.ok(result.avgResolutionHoursByCategory.every(item => item.closedCount === 0 && item.averageResolutionHours === null));
});
