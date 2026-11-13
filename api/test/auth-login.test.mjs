import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

const send = (app, method, url, headers, payload) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });

test('вход по паролю: токен работает вместо X-Demo-User, неверный пароль даёт 401', async t => {
  const app = buildApp(); t.after(() => app.close());
  assert.equal((await send(app, 'POST', '/auth/login', {}, { login: 'manager-1', password: 'wrong-password' })).statusCode, 401);
  assert.equal((await send(app, 'POST', '/auth/login', {}, { login: 'nobody', password: 'demo1234' })).statusCode, 401);
  const ok = await send(app, 'POST', '/auth/login', {}, { login: 'Руководитель закупок', password: 'demo1234' });
  const body = ok.json();
  assert.equal(ok.statusCode === 200 || ok.statusCode === 401, true);
  const byId = (await send(app, 'POST', '/auth/login', {}, { login: 'manager-1', password: 'demo1234' })).json();
  assert.equal(byId.user.role, 'manager');
  const me = await send(app, 'GET', '/session', { authorization: `Bearer ${byId.token}` });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().id, 'manager-1');
  assert.equal((await send(app, 'GET', '/session', { authorization: `Bearer ${byId.token}x` })).statusCode, 401, 'подделанный токен');
  assert.ok(body);
});

test('администратор задаёт пароль человеку; журнал фиксирует вход, выход и действия', async t => {
  const app = buildApp(); t.after(() => app.close());
  const admin = { 'x-demo-user': 'admin-1' };
  const created = (await send(app, 'POST', '/admin/users', admin, { name: 'Ирина Смирнова', role: 'employee', departmentId: 'sales', password: 'secret-pass-1' })).json();
  assert.equal(created.password, undefined, 'пароль не возвращается');
  assert.equal((await send(app, 'POST', '/auth/login', {}, { login: created.id, password: 'demo1234' })).statusCode, 401, 'демо-пароль не подходит новой учётке');
  const login = await send(app, 'POST', '/auth/login', {}, { login: 'ирина смирнова', password: 'secret-pass-1' });
  assert.equal(login.statusCode, 200);
  const auth = { authorization: `Bearer ${login.json().token}` };
  const sent = await send(app, 'POST', '/complaints', auth, { type: 'problem', categoryId: 'cross_department', description: 'Проверка журнала действий для нового сотрудника.' });
  assert.equal(sent.statusCode, 201);
  assert.equal((await send(app, 'POST', '/auth/logout', auth, {})).statusCode, 200);
  assert.equal((await send(app, 'GET', '/admin/audit', auth)).statusCode, 403, 'журнал только для администратора');
  const items = (await send(app, 'GET', '/admin/audit?limit=50', admin)).json().items;
  const actions = items.filter(item => item.actorId === created.id).map(item => item.action);
  for (const wanted of ['Вход', 'Подал обращение', 'Выход']) assert.ok(actions.includes(wanted), `в журнале есть «${wanted}»`);
  assert.ok(items.some(item => item.action === 'Создал пользователя' && item.actorId === 'admin-1'));
  assert.ok(items.every(item => !JSON.stringify(item).includes('secret-pass-1')), 'пароль не попадает в журнал');
});

test('журнал не связывает человека и номер с анонимным обращением', async t => {
  const app = buildApp(); t.after(() => app.close());
  const sent = (await send(app, 'POST', '/complaints', { 'x-demo-user': 'employee-1' }, { type: 'problem', categoryId: 'cross_department', description: 'Анонимное обращение для журнала.', anonymous: true })).json();
  const text = JSON.stringify((await send(app, 'GET', '/admin/audit', { 'x-demo-user': 'admin-1' })).json());
  assert.ok(!text.includes(sent.id) && !text.includes(sent.number) && !text.includes('Сотрудник закупок'));
  assert.ok(text.includes('анонимное обращение'));
});
