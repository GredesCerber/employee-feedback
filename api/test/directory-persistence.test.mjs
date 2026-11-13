import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../dist/app.js';
import { ComplaintStore } from '../dist/store.js';

const call = (app, method, url, user, payload) => app.inject({ method, url, headers: { 'x-demo-user': user }, ...(payload ? { payload } : {}) });

test('люди и правила маршрутизации, заведённые администратором, переживают перезапуск (файл)', async t => {
  const file = join(mkdtempSync(join(tmpdir(), 'directory-')), 'data.json');
  process.env.PERSIST_FILE = file;
  t.after(() => { delete process.env.PERSIST_FILE; });
  const first = buildApp();
  const created = (await call(first, 'POST', '/admin/users', 'admin-1', { name: 'Пётр Новиков', role: 'manager', departmentId: 'sales' })).json();
  assert.equal((await call(first, 'PATCH', '/admin/categories/training', 'admin-1', { assigneeId: created.id, dueInDays: 3 })).statusCode, 200);
  assert.equal((await call(first, 'PATCH', '/admin/users/employee-2', 'admin-1', { active: false })).statusCode, 200);
  await first.close();

  const second = buildApp();
  t.after(() => second.close());
  const users = (await call(second, 'GET', '/admin/users', 'admin-1')).json().items;
  assert.ok(users.some(user => user.id === created.id && user.role === 'manager'), 'созданный руководитель на месте');
  assert.equal(users.find(user => user.id === 'employee-2').active, false);
  const categories = (await call(second, 'GET', '/reference-data', created.id)).json().categories;
  const training = categories.find(category => category.id === 'training');
  assert.equal(training.assigneeId, created.id);
  assert.equal(training.dueInDays, 3);
  assert.equal((await call(second, 'GET', '/complaints', created.id)).statusCode, 200, 'новый руководитель работает с очередью');
});

test('каталог людей пишется в базу и читается при старте (поддельная БД)', async () => {
  const saved = [];
  let stored = null;
  const database = {
    async load() { return []; }, async save() {}, async replaceAll() {}, async close() {},
    async loadDirectory() { return stored; },
    async saveDirectory(snapshot) { saved.push(snapshot); stored = snapshot; },
  };
  const store = new ComplaintStore(undefined, database);
  await store.hydrate();
  const user = store.addUser({ name: 'Анна Руководитель', role: 'manager', departmentId: 'sales' });
  await store.flush();
  assert.ok(stored.users.some(item => item.id === user.id));
  const restarted = new ComplaintStore(undefined, database);
  await restarted.hydrate();
  assert.ok(restarted.users.some(item => item.id === user.id), 'после перезапуска человек на месте');
  await store.reset();
  await store.flush();
  assert.equal(stored, null, 'сброс демо удаляет сохранённые правки каталога');
});
