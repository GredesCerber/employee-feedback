import { existsSync, readFileSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ComplaintStore } from './store.js';
import type { DatabasePersistence } from './pg-persistence.js';
import { configureErrors } from './http.js';
import { registerComplaints } from './complaints.js';
import { registerLifecycle } from './lifecycle.js';
import { registerUndo } from './undo.js';
import { registerDiscovery } from './discovery.js';
import { registerNotifications } from './notifications.js';
import { registerRateLimit } from './rate-limit.js';
import { registerSecurity } from './security.js';
import { aiConfigFromEnv, createAiProvider, type AiProvider } from './ai/provider.js';

declare module 'fastify' {
  interface FastifyInstance { store: ComplaintStore; ai: AiProvider }
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

const stripApiPrefix = (url: string) => url.replace(/^\/api(?=\/|\?|$)/, '') || '/';
const SPA_ROUTE = '/__spa';

function createApp(options: FastifyServerOptions, store: ComplaintStore, spa = false) {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    // The frontend calls /api/*; contract paths have no prefix (nginx strips it in compose).
    // When hosting the frontend, browser page navigations (Accept: text/html) outside /api
    // go to the SPA, because routes such as /summary exist both as page and as API endpoint.
    rewriteUrl: request => {
      const url = request.url ?? '/';
      if (spa && ['GET', 'HEAD'].includes(request.method ?? '') && !/^\/(api|health)(\/|\?|$)/.test(url)
        && (request.headers.accept ?? '').includes('text/html') && !/\.[A-Za-z0-9]+(\?|$)/.test(url.split('?')[0])) {
        return SPA_ROUTE;
      }
      return stripApiPrefix(url);
    },
    ...options,
  });
  store.seed();
  app.decorate('store', store);
  // Without ANTHROPIC_API_KEY the provider never touches the network (recorded examples and keyword rules only).
  app.decorate('ai', createAiProvider(aiConfigFromEnv()));
  registerSecurity(app);
  registerRateLimit(app);
  configureErrors(app);
  app.get('/health', async () => ({ status: 'ok', version }));
  registerComplaints(app);
  registerDiscovery(app);
  registerLifecycle(app);
  registerUndo(app);
  registerNotifications(app);
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
  const hosting = Boolean(extra.webRoot && existsSync(extra.webRoot));
  const app = createApp(options, store, hosting);
  app.addHook('onClose', async () => {
    await store.flush();
    await extra.database?.close();
  });
  if (hosting && extra.webRoot) {
    await app.register(fastifyStatic, { root: extra.webRoot, wildcard: false });
    app.get(SPA_ROUTE, (_request, reply) => reply.sendFile('index.html'));
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'Не найдено.' }));
  }
  return app;
}
