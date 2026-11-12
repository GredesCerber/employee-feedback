import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

const call = (app, method, url, user, payload) => app.inject({ method, url, headers: { 'x-demo-user': user }, ...(payload ? { payload } : {}) });

test('оценка результата: один раз, только автору и только после итога', async t => {
  const app = buildApp(); t.after(() => app.close());
  assert.equal((await call(app, 'POST', '/complaints/complaint-1/feedback', 'employee-1', { understood: true, solved: true })).statusCode, 409, 'не завершено');
  assert.equal((await call(app, 'POST', '/complaints/complaint-4/feedback', 'employee-2', { understood: true, solved: true })).statusCode, 404, 'чужое');
  assert.equal((await call(app, 'POST', '/complaints/complaint-4/feedback', 'employee-1', { understood: 'да', solved: true })).statusCode, 422);
  const ok = await call(app, 'POST', '/complaints/complaint-4/feedback', 'employee-1', { understood: true, solved: false, comment: ' Не всё ' });
  assert.equal(ok.statusCode, 201);
  assert.deepEqual({ ...ok.json().feedback, createdAt: undefined }, { understood: true, solved: false, comment: 'Не всё', createdAt: undefined });
  assert.equal((await call(app, 'POST', '/complaints/complaint-4/feedback', 'employee-1', { understood: true, solved: true })).statusCode, 409, 'повтор');
  assert.equal((await call(app, 'GET', '/complaints/complaint-4', 'manager-1')).json().feedback.solved, false, 'руководитель видит оценку');
});

test('лента улучшений обезличена и считает подтверждения', async t => {
  const app = buildApp(); t.after(() => app.close());
  await call(app, 'POST', '/complaints/complaint-4/feedback', 'employee-1', { understood: true, solved: true });
  const feed = (await call(app, 'GET', '/improvements', 'employee-2')).json();
  const item = feed.items.find(entry => entry.categoryId === 'training');
  assert.ok(item);
  assert.deepEqual([item.reportersCount, item.answeredCount, item.confirmedCount, item.mine], [1, 1, 1, false]);
  assert.equal((await call(app, 'GET', '/improvements', 'employee-1')).json().items.find(entry => entry.categoryId === 'training').mine, true);
  for (const key of ['number', 'author', 'description', 'comments']) assert.equal(key in item, false, key);
  assert.equal((await call(app, 'GET', '/improvements', 'employee-1')).json().items.every(entry => entry.result.length > 0), true);
});

test('эффект пилота: период, прошлый период и валидация days', async t => {
  const app = buildApp(); t.after(() => app.close());
  assert.equal((await call(app, 'GET', '/impact', 'employee-1')).statusCode, 403);
  for (const days of ['0', '366', 'x', '1.5']) assert.equal((await call(app, 'GET', `/impact?days=${days}`, 'manager-1')).statusCode, 422, days);
  const empty = (await call(app, 'GET', '/impact?days=7', 'admin-1')).json();
  assert.equal(empty.current.total, 0);
  assert.equal(empty.current.reviewedShare, null);
  await call(app, 'POST', '/complaints', 'employee-1', { type: 'problem', categoryId: 'cross_department', description: 'Новая проблема сегодня.' });
  const impact = (await call(app, 'GET', '/impact?days=7', 'admin-1')).json();
  assert.equal(impact.current.total, 1);
  assert.equal(impact.current.reachEmployees, 1);
  assert.equal(impact.current.reviewedShare, 0);
  assert.equal(impact.categories[0].categoryId, 'cross_department');
});

test('общая проблема: объединение, план у автора и общее решение', async t => {
  const app = buildApp(); t.after(() => app.close());
  const body = { title: 'Нет актуальной версии документа', plan: 'Завести единый реестр.', complaintIds: ['complaint-1', 'complaint-3'] };
  assert.equal((await call(app, 'POST', '/problems', 'employee-1', body)).statusCode, 403);
  assert.equal((await call(app, 'POST', '/problems', 'manager-1', { ...body, complaintIds: ['complaint-1'] })).statusCode, 422);
  assert.equal((await call(app, 'POST', '/problems', 'manager-1', { ...body, complaintIds: ['complaint-1', 'missing'] })).statusCode, 404);
  assert.equal((await call(app, 'POST', '/problems', 'manager-1', { ...body, complaintIds: ['complaint-1', 'complaint-4'] })).statusCode, 409, 'завершённое');
  const created = await call(app, 'POST', '/problems', 'manager-1', body);
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().status, 'open');
  assert.equal((await call(app, 'POST', '/problems', 'manager-1', body)).statusCode, 409, 'уже в проблеме');
  const card = (await call(app, 'GET', '/complaints/complaint-3', 'manager-1')).json();
  assert.equal(card.problem.plan, 'Завести единый реестр.');
  assert.equal((await call(app, 'GET', '/problems', 'admin-1')).json().total, 1);

  await call(app, 'PATCH', '/complaints/complaint-1/status', 'manager-1', { status: 'in_review' });
  const decided = await call(app, 'POST', '/complaints/complaint-1/decision', 'manager-1', { outcome: 'implemented', explanation: 'Реестр создан.' });
  assert.equal(decided.statusCode, 201);
  const other = (await call(app, 'GET', '/complaints/complaint-3', 'manager-1')).json();
  assert.equal(other.status, 'implemented');
  assert.match(other.decision.explanation, /Реестр создан/);
  assert.equal((await call(app, 'GET', '/problems', 'manager-1')).json().items[0].status, 'resolved');
  const feed = (await call(app, 'GET', '/improvements', 'employee-1')).json().items.find(item => item.problemTitle);
  assert.equal(feed.reportersCount, 2);
  assert.equal(feed.mine, true);
});
