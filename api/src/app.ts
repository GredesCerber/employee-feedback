import { readFileSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

/** Build an isolated app without opening a port, for tests and embedding. */
export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.get('/health', async () => ({ status: 'ok', version }));
  return app;
}
