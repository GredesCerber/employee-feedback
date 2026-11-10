import { readFileSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ComplaintStore } from './store.js';
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

/** Build an isolated app without opening a port, for tests and embedding. */
export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  const store = new ComplaintStore(process.env.PERSIST_FILE);
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
