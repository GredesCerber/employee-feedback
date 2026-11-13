import type { FastifyInstance } from 'fastify';
import { issueToken } from './auth-token.js';
import { ApiError, identity, queryParameters, validateBody } from './http.js';

/** Human-readable journal labels for write operations (method + route pattern). */
const actionLabels: Record<string, string> = {
  'POST /complaints': 'Подал обращение',
  'PATCH /complaints/:complaintId/assignment': 'Назначил ответственного',
  'PATCH /complaints/:complaintId/status': 'Сменил статус',
  'POST /complaints/:complaintId/comments': 'Написал комментарий или ответ',
  'POST /complaints/:complaintId/decision': 'Зафиксировал решение',
  'POST /complaints/:complaintId/undo': 'Отменил действие',
  'POST /complaints/:complaintId/feedback': 'Оценил результат',
  'POST /admin/users': 'Создал пользователя',
  'PATCH /admin/users/:userId': 'Изменил пользователя',
  'PATCH /admin/categories/:categoryId': 'Изменил правило категории',
  'POST /demo/reset': 'Сбросил демо-данные',
};

/** Password login, logout and the action journal. Demo identity selection (X-Demo-User) keeps working next to it. */
export function registerAuth(app: FastifyInstance) {
  app.post('/auth/login', async (request) => {
    queryParameters(request, []);
    const body = validateBody<{ login: string; password: string }>('LoginInput', request.body);
    const wanted = body.login.trim().toLowerCase();
    const user = app.store.users.find(candidate => candidate.id.toLowerCase() === wanted || candidate.name.toLowerCase() === wanted);
    if (!user || !app.store.verifyPassword(user.id, body.password)) {
      app.store.audit({ actorId: user?.id ?? null, actorName: user?.name ?? null, action: 'Неудачная попытка входа', target: body.login.trim().slice(0, 100), detail: null });
      throw new ApiError(401, 'UNAUTHENTICATED', 'Неверный логин или пароль.');
    }
    app.store.audit({ actorId: user.id, actorName: user.name, action: 'Вход', target: null, detail: 'по паролю' });
    return { token: issueToken(user.id), user: { id: user.id, name: user.name, role: user.role, departmentId: user.departmentId } };
  });

  app.post('/auth/logout', async (request, reply) => {
    queryParameters(request, []);
    const user = identity(app, request);
    app.store.audit({ actorId: user.id, actorName: user.name, action: 'Выход', target: null, detail: null });
    return reply.send({ status: 'ok' });
  });

  app.get('/admin/audit', async (request) => {
    identity(app, request, ['admin']);
    const limitParam = queryParameters(request, ['limit']).get('limit');
    const limit = limitParam === null ? 100 : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new ApiError(422, 'VALIDATION_ERROR', 'limit: целое число от 1 до 500.');
    return { items: app.store.recentAudit(limit) };
  });

  // Every successful write by an identified user goes into the journal.
  app.addHook('onResponse', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || reply.statusCode >= 300) return;
    const route = request.routeOptions?.url;
    if (!route || route.startsWith('/auth/')) return;
    const label = actionLabels[`${request.method} ${route}`];
    if (!label) return;
    try {
      const user = identity(app, request);
      const params = request.params as Record<string, string> | undefined;
      const target = params?.complaintId ?? params?.userId ?? params?.categoryId ?? null;
      // Anonymous complaints: the journal must not link a person or a complaint to them.
      const anonymous = route === '/complaints' ? (request.body as { anonymous?: unknown } | undefined)?.anonymous === true
        : Boolean(params?.complaintId && app.store.get(params.complaintId)?.anonymous);
      if (anonymous) app.store.audit({ actorId: null, actorName: null, action: `${label} (анонимное обращение)`, target: null, detail: null });
      else app.store.audit({ actorId: user.id, actorName: user.name, action: label, target, detail: null });
    } catch { /* no identity: nothing to record */ }
  });
}
