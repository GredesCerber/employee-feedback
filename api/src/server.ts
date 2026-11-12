import { fileURLToPath } from 'node:url';
import { buildHostedApp } from './app.js';
import { createPgPersistence } from './pg-persistence.js';
import { startDemoBot } from './demo-bot.js';

// DATABASE_URL turns on Postgres persistence; WEB_ROOT (default ../../web/dist) is served if it exists.
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? await createPgPersistence(databaseUrl) : undefined;
const webRoot = process.env.WEB_ROOT ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
const app = await buildHostedApp({ logger: { level: process.env.LOG_LEVEL ?? 'info' } }, { database, webRoot });
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

async function shutdown() {
  try {
    await app.close();
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535');
  }
  await app.listen({ port, host });
  startDemoBot(app, (app.server.address() as { port: number }).port);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await shutdown();
}
