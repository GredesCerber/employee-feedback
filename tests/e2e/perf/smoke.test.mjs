import assert from 'node:assert/strict';
import test from 'node:test';
import { readThreshold, summarize, runSmoke } from './smoke.mjs';

test('#100 percentiles use nearest rank and server errors or a slow p95 fail', () => {
  const responses = Array.from({ length: 200 }, (_, index) => ({ status: index < 134 ? 200 : 201, ms: 200 - index }));
  const result = summarize(responses, 300);
  assert.deepEqual(result.counts, { 200: 134, 201: 66 });
  assert.equal(result.total, 200);
  assert.equal(result.p50, 100); assert.equal(result.p95, 190); assert.equal(result.max, 200);
  assert.deepEqual(result.failures, []);
  assert.match(summarize(responses, 189).failures.join(' '), /p95/);
  assert.equal(summarize(responses, 190).failures.length, 0, 'The threshold is inclusive');
  assert.match(summarize([{ status: 503, ms: 1 }], 300).failures.join(' '), /503/);
  assert.match(summarize([{ status: 429, ms: 1 }], 300).failures.join(' '), /429/);
});

test('#100 threshold defaults to 300ms and rejects invalid overrides', () => {
  assert.equal(readThreshold({}), 300);
  assert.equal(readThreshold({ PERF_P95_MS: '12.5' }), 12.5);
  for (const value of ['', '0', '-1', 'Infinity', 'NaN', 'bad']) {
    assert.throws(() => readThreshold({ PERF_P95_MS: value }), /PERF_P95_MS/);
  }
});

test('#100 opens a free port, starts all 200 requests together and restores the environment', async () => {
  const previousLimit = process.env.RATE_LIMIT_MAX;
  process.env.RATE_LIMIT_MAX = '1';
  let closeCount = 0; let started = 0;
  const pending = []; const methods = {}; const paths = new Set();
  const output = [];
  try {
    const running = runSmoke({ threshold: 300,
      appFactory: async () => {
        assert.equal(process.env.RATE_LIMIT_MAX, '0');
        return { listen: async options => { assert.deepEqual(options, { host: '127.0.0.1', port: 0 }); return 'http://127.0.0.1:12345'; },
          close: async () => { closeCount++; } };
      },
      request: async (url, options) => {
        started++; methods[options.method] = (methods[options.method] ?? 0) + 1; paths.add(new URL(url).pathname);
        await new Promise(resolve => pending.push(resolve));
        return { status: options.method === 'POST' ? 201 : 200, arrayBuffer: async () => new ArrayBuffer(0) };
      },
      log: message => output.push(message),
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(started, 200, 'Requests start concurrently, before any response completes');
    assert.deepEqual(methods, { GET: 134, POST: 66 });
    assert.deepEqual([...paths].sort(), ['/complaints', '/complaints/complaint-1']);
    pending.forEach(resolve => resolve());
    const result = await running;
    assert.equal(result.total, 200); assert.equal(closeCount, 1);
    assert.equal(process.env.RATE_LIMIT_MAX, '1');
    assert.match(output.join(' '), /RATE_LIMIT_MAX=0/);
  } finally {
    pending.forEach(resolve => resolve());
    if (previousLimit === undefined) delete process.env.RATE_LIMIT_MAX; else process.env.RATE_LIMIT_MAX = previousLimit;
  }
});

test('#100 request failures still close the app and restore the original rate limit', async () => {
  const previous = process.env.RATE_LIMIT_MAX;
  let closed = false;
  const result = await runSmoke({ threshold: 300, log: () => {},
    appFactory: async () => ({ listen: async () => 'http://127.0.0.1:12345', close: async () => { closed = true; } }),
    request: async () => { throw new Error('connection failed'); },
  });
  assert.equal(closed, true); assert.equal(process.env.RATE_LIMIT_MAX, previous);
  assert.equal(result.total, 200); assert.equal(result.counts.NETWORK_ERROR, 200);
  assert.match(result.failures.join(' '), /NETWORK_ERROR/);
});
