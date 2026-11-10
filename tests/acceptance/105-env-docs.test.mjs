import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkEnv, collectEnvUsage, formatProblems, parseEnvDoc } from '../../infra/check-env.mjs';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const HEADER = '| Переменная | Где используется | По умолчанию | Обязательна | Статус |\n|---|---|---|---|---|\n';

async function fixture(t, files) {
  const dir = await mkdtemp(join(tmpdir(), 'ef-env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}

test('#105 every env variable read in api/src, web/src and .env.example is documented in infra/ENV.md', () => {
  const { usage, unresolved } = collectEnvUsage(root);
  const doc = parseEnvDoc(readFileSync(join(root, 'infra/ENV.md'), 'utf8'));
  for (const name of ['PORT', 'HOST', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_S', 'VITE_API_BASE_URL']) assert.ok(usage.has(name), `сканер не нашёл ${name}`);
  assert.deepEqual(unresolved, []);
  for (const [name, row] of doc) {
    assert.ok(row.where && row.default && row.required, `${name}: заполните где используется, значение по умолчанию и обязательность`);
  }
  const result = checkEnv(root);
  assert.equal(formatProblems(result), '', formatProblems(result));
});

test('#105 the checker CLI is green on the repository and needs no network', () => {
  const run = spawnSync(process.execPath, ['infra/check-env.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('#105 undocumented variable in code turns the check red and lists it', async t => {
  const dir = await fixture(t, {
    'api/src/server.ts': 'const port = process.env.PORT; const k = process.env["SECRET_KEY"];',
    'web/src/client.ts': 'const base = import.meta.env.VITE_API_BASE_URL;',
    'infra/ENV.md': `${HEADER}| \`PORT\` | api | \`3000\` | нет | используется |\n`,
  });
  const result = checkEnv(dir);
  assert.deepEqual(result.undocumented, ['SECRET_KEY (api/src/server.ts)', 'VITE_API_BASE_URL (web/src/client.ts)']);
  assert.match(formatProblems(result), /Нет в infra\/ENV\.md[\s\S]*SECRET_KEY[\s\S]*VITE_API_BASE_URL/);
});

test('#105 variable read through a helper (process.env[name]) is detected', async t => {
  const dir = await fixture(t, {
    'api/src/limits.ts': 'function setting(name: string) { return process.env[name]; }\nsetting(\'RATE_LIMIT_MAX\');',
    'api/src/bad.ts': 'const all = (k: string) => process.env[k];',
    'infra/ENV.md': HEADER,
  });
  const result = checkEnv(dir);
  assert.deepEqual(result.undocumented, ['RATE_LIMIT_MAX (api/src/limits.ts)']);
  assert.deepEqual(result.unresolved, ['api/src/bad.ts: process.env[k]']);
});

test('#105 variable in ENV.md that code does not read fails unless marked «планируется»', async t => {
  const dir = await fixture(t, {
    'api/src/server.ts': 'process.env.PORT;',
    'infra/ENV.md': `${HEADER}| \`PORT\` | api | \`3000\` | нет | используется |\n| \`OLD_FLAG\` | нигде | нет | нет | используется |\n| \`LLM_API_KEY\` | ИИ-сводка | пусто | нет | планируется (#153) |\n`,
  });
  const result = checkEnv(dir);
  assert.deepEqual(result.stale, ['OLD_FLAG']);
  assert.match(formatProblems(result), /уберите или пометьте «планируется»[\s\S]*OLD_FLAG/);
  assert.doesNotMatch(formatProblems(result), /LLM_API_KEY/);
});

test('#105 .env.example for api and web must have empty values (no secrets) and be documented', async t => {
  const dir = await fixture(t, {
    'api/.env.example': 'PORT=\nAPI_TOKEN=sk-live-123\n',
    'web/.env.example': '# comment\nVITE_API_BASE_URL=\n',
    'infra/ENV.md': `${HEADER}| \`PORT\` | api | \`3000\` | нет | используется |\n| \`VITE_API_BASE_URL\` | web | \`/api\` | нет | используется |\n`,
  });
  const result = checkEnv(dir);
  assert.deepEqual(result.nonEmptyExamples, ['api/.env.example: API_TOKEN']);
  assert.deepEqual(result.undocumented, ['API_TOKEN (api/.env.example)']);
  const real = checkEnv(root);
  assert.deepEqual(real.nonEmptyExamples, []);
});

test('#105 docker-compose environment keys and ${VAR} substitutions are collected', async t => {
  const dir = await fixture(t, {
    'docker-compose.yml': 'services:\n  api:\n    environment:\n      HOST: 0.0.0.0\n      PORT: "3000"\n    ports:\n      - "${WEB_PORT:-8080}:80"\n',
    'infra/ENV.md': HEADER,
  });
  assert.deepEqual(checkEnv(dir).undocumented, ['HOST (docker-compose.yml)', 'PORT (docker-compose.yml)', 'WEB_PORT (docker-compose.yml)']);
});
