import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

const call = (app, method, url, user, payload) => app.inject({ method, url, ...(user ? { headers: { 'x-demo-user': user } } : {}), ...(payload ? { payload } : {}) });

test('разделы администратора доступны только роли admin', async t => {
  const app = buildApp(); t.after(() => app.close());
  for (const user of ['employee-1', 'manager-1']) {
    assert.equal((await call(app, 'GET', '/admin/users', user)).statusCode, 403);
    assert.equal((await call(app, 'POST', '/admin/users', user, { name: 'Тест', role: 'employee', departmentId: 'sales' })).statusCode, 403);
    assert.equal((await call(app, 'PATCH', '/admin/users/employee-2', user, { active: false })).statusCode, 403);
    assert.equal((await call(app, 'PATCH', '/admin/categories/training', user, { dueInDays: 3 })).statusCode, 403);
  }
  assert.equal((await call(app, 'GET', '/admin/users')).statusCode, 401);
  assert.equal((await call(app, 'GET', '/admin/users', 'admin-1')).statusCode, 200);
});

test('новый участник регистрируется, входит, получает роль и деактивируется', async t => {
  const app = buildApp(); t.after(() => app.close());
  const created = await call(app, 'POST', '/admin/users', 'admin-1', { name: ' Новый Участник ', role: 'employee', departmentId: 'sales' });
  assert.equal(created.statusCode, 201);
  const user = created.json();
  assert.deepEqual([user.name, user.role, user.departmentId, user.active], ['Новый Участник', 'employee', 'sales', true]);
  assert.equal((await call(app, 'POST', '/admin/users', 'admin-1', { name: 'новый участник', role: 'manager', departmentId: 'sales' })).statusCode, 409, 'дубль ФИО');
  assert.equal((await call(app, 'POST', '/admin/users', 'admin-1', { name: 'Х', role: 'boss', departmentId: 'sales' })).statusCode, 422);
  assert.equal((await call(app, 'POST', '/admin/users', 'admin-1', { name: 'Х', role: 'employee', departmentId: 'nowhere' })).statusCode, 422);
  assert.ok((await call(app, 'GET', '/demo-accounts')).json().items.some(item => item.id === user.id), 'виден на экране входа без идентификации');
  // Новый сотрудник подаёт обращение под своим именем.
  const sent = await call(app, 'POST', '/complaints', user.id, { type: 'problem', categoryId: 'cross_department', description: 'Проверка нового участника.' });
  assert.equal(sent.statusCode, 201);
  assert.equal(sent.json().author.id, user.id);
  // Смена роли действует сразу: теперь это руководитель и очередь ему доступна.
  const promoted = await call(app, 'PATCH', `/admin/users/${user.id}`, 'admin-1', { role: 'manager' });
  assert.equal(promoted.json().role, 'manager');
  assert.equal((await call(app, 'GET', '/complaints', user.id)).statusCode, 200);
  assert.ok((await call(app, 'GET', '/reference-data', 'manager-1')).json().assignees.some(item => item.id === user.id));
  // Деактивация: действовать нельзя, с экрана входа пропал, в справочнике ответственных нет.
  const off = await call(app, 'PATCH', `/admin/users/${user.id}`, 'admin-1', { active: false });
  assert.equal(off.json().active, false);
  assert.equal((await call(app, 'GET', '/complaints', user.id)).statusCode, 401);
  assert.equal((await call(app, 'GET', '/demo-accounts')).json().items.some(item => item.id === user.id), false);
  assert.equal((await call(app, 'GET', '/reference-data', 'manager-1')).json().assignees.some(item => item.id === user.id), false);
  assert.equal((await call(app, 'GET', '/admin/users', 'admin-1')).json().items.find(item => item.id === user.id).active, false);
  assert.equal((await call(app, 'PATCH', `/admin/users/${user.id}`, 'admin-1', { active: true })).json().active, true);
  assert.equal((await call(app, 'PATCH', '/admin/users/nobody', 'admin-1', { active: true })).statusCode, 404);
  assert.equal((await call(app, 'PATCH', `/admin/users/${user.id}`, 'admin-1', {})).statusCode, 422);
});

test('администратор не лишает себя прав и последнего админа не удалить', async t => {
  const app = buildApp(); t.after(() => app.close());
  assert.equal((await call(app, 'PATCH', '/admin/users/admin-1', 'admin-1', { role: 'employee' })).statusCode, 409);
  assert.equal((await call(app, 'PATCH', '/admin/users/admin-1', 'admin-1', { active: false })).statusCode, 409);
  const second = (await call(app, 'POST', '/admin/users', 'admin-1', { name: 'Второй админ', role: 'admin', departmentId: 'administration' })).json();
  assert.equal((await call(app, 'PATCH', `/admin/users/${second.id}`, second.id, { active: false })).statusCode, 409, 'сам себя');
  assert.equal((await call(app, 'PATCH', `/admin/users/${second.id}`, 'admin-1', { active: false })).statusCode, 200);
});

test('маршрутизация категории: ответственный и срок меняются и применяются к новым обращениям', async t => {
  const app = buildApp(); t.after(() => app.close());
  assert.equal((await call(app, 'PATCH', '/admin/categories/training', 'admin-1', { assigneeId: 'employee-1' })).statusCode, 422, 'не руководитель');
  assert.equal((await call(app, 'PATCH', '/admin/categories/training', 'admin-1', { dueInDays: 0 })).statusCode, 422);
  assert.equal((await call(app, 'PATCH', '/admin/categories/unknown', 'admin-1', { dueInDays: 5 })).statusCode, 404);
  const patched = await call(app, 'PATCH', '/admin/categories/cross_department', 'admin-1', { assigneeId: 'manager-2', dueInDays: 3 });
  assert.equal(patched.statusCode, 200);
  assert.deepEqual([patched.json().assigneeId, patched.json().dueInDays], ['manager-2', 3]);
  const sent = (await call(app, 'POST', '/complaints', 'employee-1', { type: 'problem', categoryId: 'cross_department', description: 'После смены правила.' })).json();
  assert.equal(sent.assignee.id, 'manager-2');
  // Руководитель, снятый с роли, освобождается от категорий: обращения идут в запасную очередь.
  await call(app, 'PATCH', '/admin/users/manager-2', 'admin-1', { role: 'employee' });
  const categories = (await call(app, 'GET', '/reference-data', 'admin-1')).json().categories;
  assert.equal(categories.find(item => item.id === 'cross_department').assigneeId, null);
  assert.equal((await call(app, 'PATCH', '/admin/categories/cross_department', 'admin-1', { assigneeId: null })).statusCode, 200);
});

test('сброс демо возвращает исходный справочник пользователей и правил', async t => {
  const app = buildApp(); t.after(() => app.close());
  const user = (await call(app, 'POST', '/admin/users', 'admin-1', { name: 'Временный', role: 'employee', departmentId: 'sales' })).json();
  await call(app, 'PATCH', '/admin/categories/cross_department', 'admin-1', { dueInDays: 2 });
  assert.equal((await call(app, 'POST', '/demo/reset', 'admin-1')).statusCode, 200);
  assert.equal((await call(app, 'GET', '/complaints', user.id)).statusCode, 401);
  assert.equal((await call(app, 'GET', '/reference-data', 'admin-1')).json().categories.find(item => item.id === 'cross_department').dueInDays, 7);
});
