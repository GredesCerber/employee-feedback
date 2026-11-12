import type { FastifyInstance } from 'fastify';
import { ApiError } from './http.js';

function integerSetting(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return parsed;
}

/** Per-process fixed windows for the finite demo identity catalogue. */
export function registerRateLimit(app: FastifyInstance) {
  const configuredLimit = integerSetting('RATE_LIMIT_MAX', 30, 0);
  const windowSeconds = integerSetting('RATE_LIMIT_WINDOW_S', 60, 1);
  if (!Number.isSafeInteger(windowSeconds * 1000)) throw new Error('RATE_LIMIT_WINDOW_S is too large');
  const limit = process.env.NODE_ENV === 'test' ? 0 : configuredLimit;
  const windows = new Map<string, { count: number; expiresAt: number }>();
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' && request.method !== 'PATCH') return;
    reply.header('X-RateLimit-Limit', limit);
    if (limit === 0) {
      reply.header('X-RateLimit-Remaining', 0);
      return;
    }
    const header = request.headers['x-demo-user'];
    // Unknown header values share one bucket; untrusted input cannot grow the map.
    const key = typeof header === 'string' && app.store.users.some(user => user.id === header) ? header : 'unauthenticated';
    const now = Date.now();
    let window = windows.get(key);
    if (!window || now >= window.expiresAt) {
      window = { count: 0, expiresAt: now + windowSeconds * 1000 };
      windows.set(key, window);
    }
    if (window.count >= limit) {
      reply.header('X-RateLimit-Remaining', 0);
      reply.header('Retry-After', Math.max(1, Math.ceil((window.expiresAt - now) / 1000)));
      throw new ApiError(429, 'RATE_LIMITED', 'Слишком много запросов записи. Повторите после указанного интервала.');
    }
    window.count++;
    reply.header('X-RateLimit-Remaining', limit - window.count);
  });
}
