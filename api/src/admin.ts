import type { FastifyInstance } from 'fastify';
import type { Role } from './model.js';
import { seedUsers } from './seed.js';
import { ApiError, identity, invalid, queryParameters, validateBody } from './http.js';

/** Built-in accounts always offered on the login screen; users added by an administrator join them. */
const seeded = new Set(seedUsers.map(user => user.id));
const featured = new Set(['employee-1', 'employee-2', 'manager-1', 'admin-1']);

/** Administration of the demo directory: users, roles, routing rules. In memory; a demo reset restores the seed. */
export function registerAdmin(app: FastifyInstance) {
  // Login screen has no identity yet: public list of accounts that can be chosen (no secrets, synthetic names).
  app.get('/demo-accounts', async request => {
    queryParameters(request, []);
    return { items: app.store.users.filter(user => featured.has(user.id) || !seeded.has(user.id)) };
  });

  app.get('/admin/users', async request => {
    identity(app, request, ['admin']);
    queryParameters(request, []);
    return { items: app.store.allUsers };
  });

  app.post('/admin/users', async (request, reply) => {
    identity(app, request, ['admin']);
    queryParameters(request, []);
    const body = validateBody<{ name: string; role: Role; departmentId: string }>('AdminUserInput', request.body);
    const name = body.name.trim();
    if (!name) invalid('ФИО не может быть пустым.');
    if (!app.store.referenceData.departments.some(department => department.id === body.departmentId)) invalid('Неизвестное подразделение.');
    if (app.store.allUsers.some(user => user.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError(409, 'CONFLICT', 'Пользователь с таким ФИО уже есть.');
    }
    return reply.code(201).send(app.store.addUser({ name, role: body.role, departmentId: body.departmentId }));
  });

  app.patch<{ Params: { userId: string } }>('/admin/users/:userId', async request => {
    const admin = identity(app, request, ['admin']);
    queryParameters(request, []);
    const body = validateBody<{ name?: string; role?: Role; departmentId?: string; active?: boolean }>('AdminUserPatch', request.body);
    const target = app.store.allUsers.find(user => user.id === request.params.userId);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Пользователь не найден.');
    if (Object.keys(body).length === 0) invalid('Укажите, что изменить.');
    if (body.name !== undefined && !body.name.trim()) invalid('ФИО не может быть пустым.');
    if (body.departmentId !== undefined && !app.store.referenceData.departments.some(department => department.id === body.departmentId)) {
      invalid('Неизвестное подразделение.');
    }
    const demoted = body.role !== undefined && body.role !== 'admin' && target.role === 'admin';
    const deactivated = body.active === false && target.active;
    if (target.id === admin.id && (demoted || deactivated)) {
      throw new ApiError(409, 'CONFLICT', 'Нельзя снять права или деактивировать самого себя.');
    }
    if ((demoted || deactivated) && target.role === 'admin' && target.active
      && !app.store.allUsers.some(user => user.id !== target.id && user.role === 'admin' && user.active)) {
      throw new ApiError(409, 'CONFLICT', 'Должен остаться хотя бы один активный администратор.');
    }
    return app.store.updateUser(target.id, { ...body, ...(body.name !== undefined ? { name: body.name.trim() } : {}) });
  });

  app.patch<{ Params: { categoryId: string } }>('/admin/categories/:categoryId', async request => {
    identity(app, request, ['admin']);
    queryParameters(request, []);
    const body = validateBody<{ assigneeId?: string | null; dueInDays?: number }>('CategoryPatch', request.body);
    if (Object.keys(body).length === 0) invalid('Укажите, что изменить.');
    if (!app.store.referenceData.categories.some(category => category.id === request.params.categoryId)) {
      throw new ApiError(404, 'NOT_FOUND', 'Категория не найдена.');
    }
    if (body.assigneeId && !app.store.users.some(user => user.id === body.assigneeId && user.role === 'manager')) {
      invalid('Ответственным может быть только активный руководитель.');
    }
    return app.store.updateCategory(request.params.categoryId, body);
  });
}
