import { existsSync, readFileSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ComplaintStore } from './store.js';
import type { DatabasePersistence } from './pg-persistence.js';
import { configureErrors } from './http.js';
import { registerComplaints } from './complaints.js';
import { registerLifecycle } from './lifecycle.js';
import { registerRateLimit } from './rate-limit.js';
import { registerSecurity } from './security.js';

declare module 'fastify' {
  interface FastifyInstance { store: ComplaintStore }
}

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export interface HostedOptions {
  /** Database storage (DATABASE_URL); omitted means in-memory or PERSIST_FILE. */
  database?: DatabasePersistence;
  /** Directory with the built frontend (web/dist). When set, the API serves it too. */
  webRoot?: string;
}

function createApp(options: FastifyServerOptions, store: ComplaintStore) {
  // The frontend calls /api/*; contract paths have no prefix (nginx strips it in compose).
  const app = Fastify({
    bodyLimit: 64 * 1024,
    rewriteUrl: request => (request.url ?? '/').replace(/^\/api(?=\/|\?|$)/, '') || '/',
    ...options,
  });
  store.seed();
  app.decorate('store', store);
  registerSecurity(app);
  registerRateLimit(app);
  configureErrors(app);
  app.get('/health', async () => ({ status: 'ok', version }));
  registerComplaints(app);
  registerLifecycle(app);
  return app;
}

/** Build an isolated app without opening a port, for tests and embedding. */
export function buildApp(options: FastifyServerOptions = {}) {
  return createApp(options, new ComplaintStore(process.env.PERSIST_FILE));
}

/** App with database storage and optional frontend hosting (single-service deploy). */
export async function buildHostedApp(options: FastifyServerOptions = {}, extra: HostedOptions = {}) {
  const store = new ComplaintStore(process.env.PERSIST_FILE, extra.database);
  await store.hydrate();
  const app = createApp(options, store);
  app.addHook('onClose', async () => {
    await store.flush();
    await extra.database?.close();
  });
  if (extra.webRoot && existsSync(extra.webRoot)) {
    await app.register(fastifyStatic, { root: extra.webRoot, wildcard: false });
    // SPA routes (/submit, /my/..., /queue/...) fall back to index.html; other misses stay 404 JSON.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && (request.headers.accept ?? '').includes('text/html')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Не найдено.' });
    });
  }
  return app;
}
