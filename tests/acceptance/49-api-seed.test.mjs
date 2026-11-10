import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';
import { ComplaintStore } from '../../api/dist/store.js';

const dataset = await readFile(new URL('../../docs/dataset.md', import.meta.url), 'utf8');
const rows = [...dataset.matchAll(/## (A-\d{3}) · (.+) · (.+)\r?\n\r?\n\*\*Автор:\*\* (.+) \*\*Приоритет:\*\* (.+) \*\*Статус:\*\* (.+)\r?\n\r?\n\*\*Текст обращения\.\*\* (.+)\r?\n\r?\n\*\*Условный ответственный:\*\* (.+) \*\*Пример дальнейшего действия:\*\* (.+)/g)];
const types = { 'Проблема': 'problem', 'Предложение': 'suggestion', 'Положительный отзыв': 'praise' };
const priorities = { 'Низкий': 'low', 'Средний': 'medium', 'Высокий': 'high' };
const statuses = { 'Новое': 'new', 'На рассмотрении': 'in_review', 'В работе': 'in_progress', 'Реализовано': 'implemented', 'Ожидает уточнения': 'awaiting_clarification', 'Отклонено': 'rejected', 'Закрыто': 'closed' };

test('#49 seed preserves all 20 synthetic records and their source fields', () => {
  const store = new ComplaintStore();
  store.seed();
  assert.equal(rows.length, 20);
  assert.equal(store.list().length, 20);
  for (const [, number, type, category, author, priority, status, description, assignee] of rows) {
    const item = store.list().find((candidate) => candidate.number === number);
    assert.ok(item, number);
    assert.equal(item.type, types[type]);
    assert.equal(store.referenceData.categories.find((entry) => entry.id === item.categoryId).name, category);
    assert.equal(item.priority, priorities[priority]);
    assert.equal(item.status, statuses[status]);
    assert.equal(item.author.name, author);
    assert.equal(item.description, description);
    assert.equal(item.assignee.name, assignee);
  }
});

test('#49 repeated seed does not duplicate or overwrite existing records', () => {
  const store = new ComplaintStore();
  store.seed();
  const initial = store.list();
  store.seed();
  assert.deepEqual(store.list(), initial);
  initial[0].description = 'external mutation';
  assert.notEqual(store.list()[0].description, initial[0].description);
});

test('#49 new API instance starts with the same 20 demo records', async (t) => {
  const first = buildApp();
  t.after(() => first.close());
  const before = first.store.list();
  assert.equal(before.length, 20);
  await first.close();
  const second = buildApp();
  t.after(() => second.close());
  assert.deepEqual(second.store.list(), before);
  assert.notEqual(first.store, second.store);
});
