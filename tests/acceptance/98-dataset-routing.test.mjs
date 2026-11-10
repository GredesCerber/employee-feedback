import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const dataset = readFileSync(new URL('../../docs/dataset.md', import.meta.url), 'utf8');
const seed = JSON.parse(readFileSync(new URL('../../api/data/seed.json', import.meta.url), 'utf8'));
const typeIds = { 'Проблема': 'problem', 'Предложение': 'suggestion', 'Положительный отзыв': 'praise' };
const priorityIds = { 'Низкий': 'low', 'Средний': 'medium', 'Высокий': 'high' };
const statusIds = { 'Новое': 'new', 'На рассмотрении': 'in_review', 'В работе': 'in_progress',
  'Ожидает уточнения': 'awaiting_clarification', 'Реализовано': 'implemented', 'Отклонено': 'rejected', 'Закрыто': 'closed' };
const sourceRows = [...dataset.matchAll(/## (A-\d{3}) · (.+) · (.+)\r?\n\r?\n\*\*Автор:\*\* (.+) \*\*Приоритет:\*\* (.+) \*\*Статус:\*\* (.+)\r?\n\r?\n\*\*Текст обращения\.\*\* (.+)\r?\n\r?\n\*\*Условный ответственный:\*\* (.+) \*\*Пример дальнейшего действия:\*\* (.+)/g)]
  .map(([, number, type, category, author, priority, status, description, assignee, nextAction]) =>
    ({ number, type: typeIds[type], category, author, priority: priorityIds[priority], status: statusIds[status],
      description, assignee, nextAction }));

test('#98 every A-001..A-020 record matches the organizer dataset', () => {
  const expectedNumbers = Array.from({ length: 20 }, (_, index) => `A-${String(index + 1).padStart(3, '0')}`);
  assert.deepEqual(sourceRows.map(row => row.number), expectedNumbers, 'All twenty source records must be parsed');
  assert.deepEqual(seed.map(row => row.number), expectedNumbers, 'Seed must contain every source record exactly once');
  const differences = [];
  for (const source of sourceRows) {
    const actual = seed.find(row => row.number === source.number);
    for (const field of ['type', 'category', 'priority', 'status', 'assignee', 'description']) {
      if (source[field] === undefined || actual[field] !== source[field]) {
        differences.push(`${source.number}.${field}: expected=${JSON.stringify(source[field])}, actual=${JSON.stringify(actual[field])}`);
      }
    }
  }
  assert.deepEqual(differences, [], `Dataset differences:\n${differences.join('\n')}`);
});

test('#98 all source texts are routed by the category rule and missing rules use the unassigned queue', async t => {
  const app = buildApp(); t.after(() => app.close());
  const catalogResponse = await app.inject({ url: '/reference-data', headers: { 'x-demo-user': 'manager-1' } });
  assert.equal(catalogResponse.statusCode, 200);
  const catalog = catalogResponse.json();
  const report = ['number | expected assignee | actual assignee'];
  const differences = [];
  for (const source of sourceRows) {
    const category = catalog.categories.find(item => item.name === source.category);
    assert.ok(category, `${source.number}: category ${source.category} exists`);
    const expected = catalog.assignees.find(item => item.id === category.assigneeId)?.name ?? null;
    const response = await app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' },
      payload: { type: source.type, categoryId: category.id, priority: source.priority, description: source.description } });
    assert.equal(response.statusCode, 201, `${source.number}: ${response.body}`);
    const actual = response.json();
    report.push(`${source.number} | ${expected ?? '(unassigned)'} | ${actual.assignee?.name ?? '(unassigned)'}`);
    if ((actual.assignee?.id ?? null) !== category.assigneeId || actual.routing.queue !== (category.assigneeId ? 'assigned' : 'unassigned')) {
      differences.push(`${source.number}: ${JSON.stringify(actual.routing)}, assignee=${actual.assignee?.id}`);
    }
  }
  t.diagnostic(report.join('\n'));
  assert.deepEqual(differences, [], `Routing differences:\n${differences.join('\n')}`);
  const noRule = catalog.categories.find(item => item.assigneeId === null);
  assert.ok(noRule, 'The demo catalog provides a category without a routing rule');
  const response = await app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' },
    payload: { type: sourceRows[0].type, categoryId: noRule.id, description: sourceRows[0].description } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().assignee, null);
  assert.deepEqual(response.json().routing, { queue: 'unassigned', reason: 'no_rule' });
});

test('#98 clarification and terminal seed cards contain their explanatory comment or decision', async t => {
  const app = buildApp(); t.after(() => app.close());
  const missing = [];
  for (const row of seed.filter(item => ['awaiting_clarification', 'implemented', 'closed', 'rejected'].includes(item.status))) {
    const record = app.store.list().find(item => item.number === row.number);
    assert.ok(record, `${row.number}: seed card exists`);
    const response = await app.inject({ url: `/complaints/${record.id}`, headers: { 'x-demo-user': 'manager-1' } });
    assert.equal(response.statusCode, 200, row.number);
    const card = response.json();
    if (row.status === 'awaiting_clarification') {
      if (!card.comments.some(comment => comment.kind === 'clarification_request' && comment.text.trim().length > 0)) {
        missing.push(`${row.number}: awaiting_clarification has no clarification_request comment with an explanation`);
      }
    } else if (card.decision?.outcome !== row.status || !card.decision?.explanation.trim()) {
      missing.push(`${row.number}: ${row.status} has no matching decision with an explanation`);
    }
  }
  assert.deepEqual(missing, [], `Incomplete seed cards:\n${missing.join('\n')}`);
});
