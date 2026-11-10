import { existsSync, readFileSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ComplaintStore } from './store.js';
import type { Persistence } from './persistence.js';
import { configureErrors } from './http.js';
import { registerComplaints } from './complaints.js';
import { registerLifecycle } from './lifecycle.js';

declare module 'fastify' {
  interface FastifyInstance { store: ComplaintStore }
}

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export interface AppOptions {
  /** Durable storage; omitted means in-memory demo data reset on restart. */
  persistence?: Persistence;
  /** Directory with the built frontend (web/dist). When set, the API serves it too. */
  webRoot?: string;
}

function createApp(options: FastifyServerOptions, store: ComplaintStore) {
  // The frontend calls /api/*; contract paths have no prefix (nginx strips it in compose).
  const app = Fastify({
    rewriteUrl: request => (request.url ?? '/').replace(/^\/api(?=\/|\?|$)/, '') || '/',
    ...options,
  });
  app.decorate('store', store);
  configureErrors(app);
  app.get('/health', async () => ({ status: 'ok', version }));
  registerComplaints(app);
  registerLifecycle(app);
  return app;
}

/** Build an isolated in-memory app without opening a port, for tests and embedding. */
export function buildApp(options: FastifyServerOptions = {}) {
  const store = new ComplaintStore();
  store.seed();
  return createApp(options, store);
}

/** App with durable storage and optional frontend hosting (single-service deploy). */
export async function buildHostedApp(options: FastifyServerOptions = {}, extra: AppOptions = {}) {
  const store = new ComplaintStore(extra.persistence);
  await store.hydrate();
  store.seed();
  const app = createApp(options, store);
  app.addHook('onClose', async () => {
    await store.flush();
    await extra.persistence?.close();
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
