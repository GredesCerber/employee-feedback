import type { FastifyInstance } from 'fastify';

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const value of (process.env.CORS_ORIGINS ?? '').split(',')) {
    const origin = value.trim();
    if (!origin) continue;
    let url: URL;
    try { url = new URL(origin); }
    catch { throw new Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CORS_ORIGINS must contain HTTP(S) origins without paths, credentials or wildcards');
    }
    origins.add(origin);
  }
  return origins;
}

/** Browser access policy only; demo identity and API permissions remain separate. */
export function registerSecurity(app: FastifyInstance) {
  const origins = configuredOrigins();
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origins.size > 0) reply.header('Vary', 'Origin');
    if (!origin || !origins.has(origin)) return;
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Expose-Headers', 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-Request-Id');
    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Demo-User, X-Request-Id');
      return reply.code(204).send();
    }
  });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
}
