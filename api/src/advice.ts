import type { FastifyInstance } from 'fastify';
import { identity, queryParameters, visibleComplaint } from './http.js';
import { presentFor } from './undo.js';
import { buildAdviceContext } from './ai/advice.js';

/**
 * «Помощь ИИ» (POST /complaints/{id}/advice): варианты решения для роли того, кто спрашивает.
 * Доступ как у карточки: чужое или несуществующее обращение даёт один и тот же 404.
 * В модель уходит только то, что эта роль видит в карточке, без имён и ID людей.
 * Анонимные обращения в модель не отправляются: ответ по правилам.
 */
export function registerAdvice(app: FastifyInstance) {
  app.post<{ Params: { complaintId: string } }>('/complaints/:complaintId/advice', async request => {
    const user = identity(app, request);
    queryParameters(request, []);
    const item = visibleComplaint(app, request.params.complaintId, user);
    const context = buildAdviceContext(presentFor(app, item, user), user, app.store.referenceData);
    return app.ai.advise(context, Boolean(item.anonymous), request.log);
  });
}
