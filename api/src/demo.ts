import type { FastifyInstance } from 'fastify';
import { ApiError, identity, queryParameters } from './http.js';

/** Reset is a demo feature: on by default, `DEMO_RESET_ENABLED=false` switches it off (production). */
const resetEnabled = () => process.env.DEMO_RESET_ENABLED !== 'false';

export function registerDemo(app: FastifyInstance) {
  app.post('/demo/reset', async request => {
    const user = identity(app, request, ['admin']);
    queryParameters(request, []);
    if (!resetEnabled()) throw new ApiError(404, 'NOT_FOUND', 'Сброс демо недоступен в этой среде.');
    const loadedCount = await app.store.reset();
    // Only ids and counts: complaint text and secrets never reach the log.
    request.log.info({ event: 'demo_reset', actorId: user.id, loadedCount }, 'demo reset to seed');
    return { loadedCount };
  });
}
