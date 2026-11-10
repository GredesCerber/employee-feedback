import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function readThreshold(env = process.env) {
  const value = env.PERF_P95_MS === undefined ? 300 : Number(env.PERF_P95_MS);
  if (!Number.isFinite(value) || value <= 0) throw new Error('PERF_P95_MS must be a positive finite number of milliseconds');
  return value;
}

export function summarize(responses, threshold) {
  if (!responses.length) throw new Error('No responses to summarize');
  const times = responses.map(item => item.ms).sort((a, b) => a - b);
  const percentile = fraction => times[Math.ceil(times.length * fraction) - 1];
  const counts = {};
  for (const response of responses) counts[response.status] = (counts[response.status] ?? 0) + 1;
  const p95 = percentile(0.95);
  const failures = Object.keys(counts).filter(code => !(Number(code) >= 200 && Number(code) < 300))
    .map(code => `${counts[code]} responses with ${code}`);
  if (p95 > threshold) failures.push(`p95 ${p95.toFixed(2)} ms exceeds ${threshold} ms`);
  return { total: responses.length, counts, p50: percentile(0.5), p95, max: times.at(-1), failures };
}

async function defaultAppFactory() {
  const { buildApp } = await import('../../../api/dist/app.js');
  return buildApp();
}

export async function runSmoke({ threshold = readThreshold(), appFactory = defaultAppFactory, request = fetch, log = console.log } = {}) {
  const originalLimit = process.env.RATE_LIMIT_MAX;
  const originalPersistence = process.env.PERSIST_FILE;
  process.env.RATE_LIMIT_MAX = '0';
  process.env.PERSIST_FILE = '';
  log(`Rate limit disabled for this run: RATE_LIMIT_MAX=0 (previous: ${originalLimit ?? 'default'}). Temporary in-memory seed only.`);
  let app;
  try {
    app = await appFactory();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    log(`API ${address}; 200 concurrent requests; p95 threshold ${threshold} ms.`);
    const responses = await Promise.all(Array.from({ length: 200 }, async (_, index) => {
      const create = index % 3 === 2;
      const path = index % 3 === 1 ? '/complaints/complaint-1' : '/complaints';
      const started = performance.now();
      try {
        const response = await request(`${address}${path}`, {
          method: create ? 'POST' : 'GET',
          headers: { 'x-demo-user': create ? 'employee-1' : 'manager-1', ...(create ? { 'content-type': 'application/json' } : {}) },
          ...(create ? { body: JSON.stringify({ type: 'problem', categoryId: 'cross_department', description: `Synthetic performance smoke ${index}` }) } : {}),
          signal: AbortSignal.timeout(15000),
        });
        await response.arrayBuffer();
        return { status: response.status, ms: performance.now() - started };
      } catch {
        return { status: 'NETWORK_ERROR', ms: performance.now() - started };
      }
    }));
    return summarize(responses, threshold);
  } finally {
    try { if (app) await app.close(); }
    finally {
      if (originalLimit === undefined) delete process.env.RATE_LIMIT_MAX; else process.env.RATE_LIMIT_MAX = originalLimit;
      if (originalPersistence === undefined) delete process.env.PERSIST_FILE; else process.env.PERSIST_FILE = originalPersistence;
    }
  }
}

export async function main() {
  try {
    const result = await runSmoke();
    console.table(Object.entries(result.counts).map(([code, count]) => ({ code, count })));
    console.table([{ requests: result.total, 'p50 ms': result.p50.toFixed(2), 'p95 ms': result.p95.toFixed(2), 'max ms': result.max.toFixed(2) }]);
    if (result.failures.length) {
      console.error(`FAIL: ${result.failures.join('; ')}`);
      return 1;
    }
    console.log('PASS: all responses succeeded and p95 is within the threshold.');
    return 0;
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    if (error.code === 'ERR_MODULE_NOT_FOUND') console.error('Prepare the API first: npm --prefix api ci && npm --prefix api run build');
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main();
