#!/usr/bin/env node
// Точка входа `npm run demo:sim` (#146): мягкая остановка по Ctrl+C.
import { main } from './cli.mjs';

const controller = new AbortController();
for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => controller.abort());
process.exitCode = await main(process.argv.slice(2), { signal: controller.signal });
