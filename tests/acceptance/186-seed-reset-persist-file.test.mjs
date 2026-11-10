// #186: --seed-reset исключает PERSIST_FILE из окружения дочернего API, не трогая файл данных.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { childEnv, seedResetUnset } from '../../infra/demo-env.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dryRun = (args, env) => spawnSync(process.execPath, ['infra/run-demo.mjs', '--dry-run', '--no-install', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });

async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const { port } = server.address(); await new Promise(done => server.close(done)); return port;
}

/** Запускает текущий API (api/dist) с окружением, которое собрал бы run-demo, и возвращает ответы. */
async function runApi(env) {
  const port = await freePort();
  const child = spawn(process.execPath, ['api/dist/server.js'], { cwd: root, env: { ...env, HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    let health;
    for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt++) {
      try { health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }); if (health.ok) break; } catch { /* старт */ }
      await new Promise(done => setTimeout(done, 100));
    }
    assert.ok(health?.ok, `API не поднялся: exit=${child.exitCode}\n${stderr}`);
    const list = await (await fetch(`http://127.0.0.1:${port}/complaints?limit=1`, { headers: { 'X-Demo-User': 'manager-1' } })).json();
    return { total: list.total };
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'close');
  }
}

test('#186 dry run with --seed-reset declares PERSIST_FILE excluded, no empty string, no other environment leaked', () => {
  const result = dryRun(['--seed-reset'], { PERSIST_FILE: 'C:/secret/data.json', SECRET_TOKEN_186: 'must-not-leak' });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal('PERSIST_FILE' in plan.apiEnv, false);
  assert.deepEqual(plan.apiEnvUnset, ['PERSIST_FILE']);
  assert.ok(!result.stdout.includes('""'), 'в плане нет пустых строк вместо исключения');
  assert.ok(!result.stdout.includes('C:/secret/data.json'), 'путь к файлу данных не раскрывается');
  assert.ok(!result.stdout.includes('must-not-leak'), 'остальное окружение не раскрывается');
});

test('#186 normal run inherits PERSIST_FILE', () => {
  const plan = JSON.parse(dryRun([], { PERSIST_FILE: 'data.json' }).stdout);
  assert.deepEqual(plan.apiEnvUnset, []);
  assert.equal('PERSIST_FILE' in plan.apiEnv, false, 'значение не переопределяется, а наследуется из окружения');
  assert.equal(childEnv({ PERSIST_FILE: 'data.json', A: '1' }, { PORT: '1' }, []).PERSIST_FILE, 'data.json');
  const reset = childEnv({ PERSIST_FILE: 'data.json', A: '1' }, { PORT: '1' }, seedResetUnset(true));
  assert.equal('PERSIST_FILE' in reset, false);
  assert.equal(reset.A, '1');
  assert.deepEqual(seedResetUnset(false), []);
});

test('#186 real API: --seed-reset starts on the seed in memory and leaves the existing data file byte-identical', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ef-186-'));
  try {
    const file = join(dir, 'data.json');
    const original = '{"note":"существующий файл пользователя, не трогать"}\n';
    writeFileSync(file, original, 'utf8');
    const env = childEnv({ ...process.env, PERSIST_FILE: file }, {}, seedResetUnset(true));
    const { total } = await runApi(env);
    assert.ok(total >= 20, `seed в памяти (total=${total})`);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.deepEqual(readdirSync(dir).sort(), ['data.json'], 'рядом не появилось резервных копий и временных файлов');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('#186 real API: a normal run keeps file persistence working', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ef-186-'));
  try {
    const file = join(dir, 'data.json');
    const env = childEnv({ ...process.env, PERSIST_FILE: file }, {}, seedResetUnset(false));
    const { total } = await runApi(env);
    assert.ok(total >= 20);
    assert.ok(existsSync(file), 'файл данных создан API');
    assert.ok(Array.isArray(JSON.parse(readFileSync(file, 'utf8'))), 'в файле снимок обращений');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

