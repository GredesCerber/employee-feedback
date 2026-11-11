// #146: демо-симулятор (npm run demo:sim) ходит в API по HTTP как люди. Сеть не используется: API поднимается в тесте на локальном порту.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../api/dist/app.js';
import { main, parseArgs } from '../../scripts/demo-sim/cli.mjs';
import { runSimulation } from '../../scripts/demo-sim/simulator.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const transitions = contract['x-status-transitions'];

async function startApi(t, env = {}) {
  const values = { NODE_ENV: 'development', RATE_LIMIT_MAX: '0', RATE_LIMIT_WINDOW_S: '60', DEMO_SIMULATION_ENABLED: 'true',
    DEMO_RESET_ENABLED: undefined, PERSIST_FILE: undefined, DATABASE_URL: undefined, ANTHROPIC_API_KEY: undefined, ...env };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  const app = buildApp();
  const seen = [];
  app.addHook('onSend', async (request, reply, payload) => {
    let code = null;
    if (reply.statusCode >= 400) { try { code = JSON.parse(String(payload)).code ?? null; } catch { /* not json */ } }
    seen.push({ method: request.method, url: request.url, status: reply.statusCode, code,
      source: request.headers['x-demo-source'] ?? null, user: request.headers['x-demo-user'] ?? null });
    return payload;
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  t.after(async () => {
    await app.close();
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  return { app, seen, url: `http://127.0.0.1:${app.server.address().port}` };
}

const lines = () => { const out = []; return { out, write: line => { out.push(String(line)); } }; };
async function list(url, query = '') {
  const response = await fetch(`${url}/complaints?limit=100${query}`, { headers: { 'x-demo-user': 'admin-1' } });
  return response.json();
}
const quickIo = (extra = {}) => { const o = lines(), e = lines();
  return { o, e, io: { stdout: o, stderr: e, sleep: async () => {}, ...extra } }; };

/** Дочерний процесс с жёстким таймаутом: никогда не остаётся висеть. */
function runChild(t, args, env, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/demo-sim/index.mjs', ...args], { cwd: root, env: { ...process.env, ...env }, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`дочерний процесс завис: ${stdout}${stderr}`)); }, timeoutMs);
    t.after(() => { clearTimeout(timer); child.kill('SIGKILL'); });
    child.on('error', reject);
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, child }); });
  });
}

test('#146 --once --seed 1: команда создаёт действие, обращение simulated=true, код выхода 0', async t => {
  const api = await startApi(t);
  const before = (await list(api.url)).total;
  const run = await runChild(t, ['--once', '--seed', '1', '--api-url', api.url], { DEMO_SIMULATION_ENABLED: 'true' });
  assert.equal(run.code, 0, run.stdout + run.stderr);
  const after = await list(api.url);
  assert.equal(after.total, before + 1, 'первый шаг пустой очереди — новое обращение');
  const created = (await list(api.url, '&simulated=true')).items;
  assert.equal(created.length, 1);
  assert.equal(created[0].simulated, true);
  assert.ok(created[0].history.every(event => event.simulated === true));
  assert.match(run.stdout, /подал обращение A-021/);
  assert.match(run.stdout, /Итог/);
  const writes = api.seen.filter(entry => entry.method !== 'GET');
  assert.ok(writes.length >= 1 && writes.every(entry => entry.source === 'simulator'), 'каждая запись идёт с X-Demo-Source: simulator');
});

test('#146 каждый запрос симулятора (и чтение тоже) несёт X-Demo-Source: simulator и демо-пользователя', async t => {
  const api = await startApi(t);
  const { io } = quickIo();
  assert.equal(await main(['--max-events', '8', '--seed', '3', '--interval', '0', '--api-url', api.url], { env: { DEMO_SIMULATION_ENABLED: 'true' }, ...io }), 0);
  assert.ok(api.seen.length > 8);
  for (const entry of api.seen) {
    assert.equal(entry.source, 'simulator', `${entry.method} ${entry.url}`);
    assert.match(entry.user ?? '', /^(employee|manager|admin)-\d+$/);
  }
});

test('#146 без DEMO_SIMULATION_ENABLED скрипт выходит с кодом ≠ 0, сообщает что имитация выключена и ничего не создаёт', async t => {
  const api = await startApi(t, { DEMO_SIMULATION_ENABLED: undefined });
  const before = (await list(api.url)).total;
  const env = { DEMO_SIMULATION_ENABLED: '' };
  const run = await runChild(t, ['--once', '--seed', '1', '--api-url', api.url], env);
  assert.notEqual(run.code, 0);
  assert.match(run.stdout + run.stderr, /имитация выключена/i);
  assert.equal((await list(api.url)).total, before);
  assert.equal(api.seen.filter(entry => entry.method !== 'GET').length, 0, 'ни одной записи');
  const { o, e, io } = quickIo();
  assert.notEqual(await main(['--once', '--api-url', api.url], { env: {}, ...io }), 0);
  assert.match(o.out.join('\n') + e.out.join('\n'), /имитация выключена/i);
});

test('#146 флаг у скрипта есть, а у API выключен: останавливается после первой записи с понятным сообщением', async t => {
  const api = await startApi(t, { DEMO_SIMULATION_ENABLED: undefined });
  const { o, e, io } = quickIo();
  const code = await main(['--max-events', '5', '--seed', '1', '--interval', '0', '--api-url', api.url], { env: { DEMO_SIMULATION_ENABLED: 'true' }, ...io });
  assert.notEqual(code, 0);
  assert.match(o.out.join('\n') + e.out.join('\n'), /имитация выключена/i);
  assert.ok(api.seen.filter(entry => entry.method !== 'GET').length <= 1, 'после обнаружения больше ничего не пишет');
});

test('#146 два прогона с одним --seed и --max-events 20 дают одинаковую последовательность типов действий', async t => {
  const sequences = [];
  for (let i = 0; i < 2; i++) {
    const api = await startApi(t);
    const result = await runSimulation({ baseUrl: api.url, seed: 42, maxEvents: 20, intervalMs: 0, sleep: async () => {}, log: () => {} });
    assert.equal(result.events, 20);
    sequences.push(result.actions.map(action => action.type));
    await api.app.close();
  }
  assert.deepEqual(sequences[0], sequences[1]);
  assert.ok(new Set(sequences[0]).size >= 3, `разнообразие действий: ${sequences[0]}`);
  const other = await startApi(t);
  const different = await runSimulation({ baseUrl: other.url, seed: 7, maxEvents: 20, intervalMs: 0, sleep: async () => {}, log: () => {} });
  assert.notDeepEqual(different.actions.map(action => action.type), sequences[0], 'другой seed — другая последовательность');
});

test('#146 весь прогон: ни одного 5xx, ни одного недопустимого перехода, переходы только из контракта', async t => {
  const api = await startApi(t);
  const result = await runSimulation({ baseUrl: api.url, seed: 5, maxEvents: 80, intervalMs: 0, sleep: async () => {}, log: () => {} });
  assert.equal(result.errors, 0);
  assert.equal(api.seen.filter(entry => entry.status >= 500).length, 0);
  assert.equal(api.seen.filter(entry => entry.code === 'INVALID_TRANSITION').length, 0);
  assert.equal(api.seen.filter(entry => entry.status >= 400).length, 0, JSON.stringify(api.seen.filter(entry => entry.status >= 400)));
  // каждое изменение статуса в истории созданных обращений допустимо по контракту
  const items = (await list(api.url, '&simulated=true')).items;
  assert.ok(items.length > 0);
  for (const item of items) {
    for (const event of item.history.filter(entry => entry.fromStatus && entry.toStatus && entry.kind !== 'undone')) {
      assert.ok(transitions[event.fromStatus].includes(event.toStatus), `${item.number}: ${event.fromStatus} → ${event.toStatus}`);
    }
  }
  const types = new Set(result.actions.map(action => action.type));
  for (const type of ['submit', 'take']) assert.ok(types.has(type), `нет действия ${type}: ${[...types]}`);
  assert.ok(result.counters.rejected + result.counters.resolved > 0, 'есть решённые или отклонённые');
  // seed-обращения не тронуты симулятором
  const seed = (await list(api.url, '&simulated=false')).items;
  assert.ok(seed.every(item => item.history.every(event => event.simulated === false)));
});

test('#146 ответ 429: ждёт Retry-After, повторяет запрос и продолжает', async t => {
  const delays = [];
  let rejected = 0;
  const api = await startApi(t);
  const proxy = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/complaints' && rejected < 2) {
      rejected++;
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3' });
      response.end(JSON.stringify({ code: 'RATE_LIMITED', message: 'Слишком много запросов записи.' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(api.url + request.url, { method: request.method, headers: Object.fromEntries(Object.entries(request.headers).filter(([key]) => key !== 'host' && key !== 'content-length')),
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks) });
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(() => proxy.close());
  const baseUrl = `http://127.0.0.1:${proxy.address().port}`;
  const result = await runSimulation({ baseUrl, seed: 1, maxEvents: 3, intervalMs: 0, log: () => {},
    sleep: async ms => { if (ms > 0) delays.push(ms); } });
  assert.equal(rejected, 2);
  assert.deepEqual(delays, [3000, 3000]);
  assert.equal(result.events, 3);
  assert.equal(result.errors, 0);
  assert.equal(result.counters.submitted >= 1, true);
});

test('#146 настоящий лимит API: симулятор переживает 429 и завершает прогон с кодом 0', async t => {
  const api = await startApi(t, { RATE_LIMIT_MAX: '1', RATE_LIMIT_WINDOW_S: '1' });
  const { o, io } = quickIo({ sleep: undefined });
  const code = await main(['--max-events', '12', '--seed', '2', '--interval', '0', '--api-url', api.url], { env: { DEMO_SIMULATION_ENABLED: 'true' }, ...io });
  assert.equal(code, 0, o.out.join('\n'));
  assert.ok(api.seen.some(entry => entry.status === 429), 'лимит действительно сработал');
  assert.equal(api.seen.filter(entry => entry.status >= 500).length, 0);
  assert.match(o.out.join('\n'), /Итог/);
});

test('#146 мягкая остановка по сигналу: процесс завершается чисто и печатает итог (подано, принято, отклонено)', async t => {
  const api = await startApi(t);
  const controller = new AbortController();
  const { o, io } = quickIo({ sleep: undefined, signal: controller.signal });
  let writes = 0;
  const stdout = { write: line => { o.write(line); if (/подал обращение/.test(String(line)) && ++writes === 1) controller.abort(); } };
  const code = await main(['--seed', '1', '--interval', '600', '--api-url', api.url], { env: { DEMO_SIMULATION_ENABLED: 'true' }, ...io, stdout });
  assert.equal(code, 0);
  const text = o.out.join('\n');
  assert.match(text, /остановлен/i);
  assert.match(text, /Итог: подано 1, взято в работу 0, отклонено 0/);
});

if (process.platform !== 'win32') {
  test('#146 настоящий SIGINT дочернему процессу: чистый выход с кодом 0 и итог', async t => {
    const api = await startApi(t);
    const child = spawn(process.execPath, ['scripts/demo-sim/index.mjs', '--seed', '1', '--interval', '600', '--api-url', api.url],
      { cwd: root, env: { ...process.env, DEMO_SIMULATION_ENABLED: 'true' } });
    t.after(() => child.kill('SIGKILL'));
    let stdout = '';
    const done = new Promise(resolve => child.on('close', code => resolve(code)));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('нет вывода')), 20_000);
      child.stdout.on('data', chunk => { stdout += chunk; if (/подал обращение/.test(stdout)) { clearTimeout(timer); resolve(); } });
    });
    child.kill('SIGINT');
    assert.equal(await done, 0);
    assert.match(stdout, /Итог: подано 1/);
  });
}

test('#146 аргументы: интервал, seed, max-events, once; неверные значения отклоняются', () => {
  assert.deepEqual(parseArgs([]).options, { intervalMs: 8000, seed: undefined, maxEvents: Infinity, once: false, apiUrl: 'http://127.0.0.1:3000' });
  const parsed = parseArgs(['--interval', '0.5', '--seed', '9', '--max-events', '4', '--api-url', 'http://127.0.0.1:4000/']).options;
  assert.deepEqual(parsed, { intervalMs: 500, seed: 9, maxEvents: 4, once: false, apiUrl: 'http://127.0.0.1:4000' });
  assert.equal(parseArgs(['--once']).options.maxEvents, 1);
  for (const bad of [['--interval', '-1'], ['--seed', 'x'], ['--max-events', '0'], ['--nope'], ['--api-url', 'ftp://x']]) {
    assert.ok(parseArgs(bad).error, bad.join(' '));
  }
  assert.ok(parseArgs(['--help']).help);
});

test('#146 симулятор не запускается вместе с npm run demo; команда demo:sim заведена в корневом package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['demo:sim'], 'node scripts/demo-sim/index.mjs');
  assert.ok(!Object.entries(pkg.scripts).some(([name, command]) => name !== 'demo:sim' && /demo-sim|demo:sim/.test(command)));
  const runner = readFileSync(new URL('../../infra/run-demo.mjs', import.meta.url), 'utf8');
  assert.ok(!/demo-sim|DEMO_SIMULATION_ENABLED/.test(runner), 'тихая включённость запрещена');
  const docs = readFileSync(new URL('../../docs/demo-simulation.md', import.meta.url), 'utf8');
  assert.match(docs, /npm run demo:sim/);
  assert.match(docs, /DEMO_SIMULATION_ENABLED=true/);
  assert.match(readFileSync(new URL('../../infra/ENV.md', import.meta.url), 'utf8'), /DEMO_SIMULATION_ENABLED[^\n]*scripts\/demo-sim/);
});
