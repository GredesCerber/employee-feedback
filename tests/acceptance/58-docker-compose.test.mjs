// #58 Запуск и деплой: docker-compose и инструкция.
// Критерий 1: на машине с Docker `docker compose up` поднимает фронтенд и API с демо-данными.
// Критерий 2: README с шагами запуска, демо-логинами ролей и разделом «реализовано / имитация / план».
// Тест не пропускается без Docker: он проверяет именно контейнерный запуск.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function compose(args, env) {
  return spawnSync('docker', ['compose', ...args], {
    cwd: root, encoding: 'utf8', timeout: 600_000, env: { ...process.env, ...env },
  });
}

async function waitFor(url, init, attempts = 60) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${url} не ответил: ${last}`);
}

test('#58 docker compose up поднимает фронтенд и API с демо-данными', { timeout: 840_000 }, async (t) => {
  const port = await freePort();
  const env = { COMPOSE_PROJECT_NAME: `ef-acceptance-${process.pid}`, WEB_PORT: String(port) };
  t.after(() => compose(['down', '--volumes', '--remove-orphans'], env));

  const up = compose(['up', '--build', '--detach', '--wait'], env);
  assert.equal(up.status, 0, `docker compose up упал: ${up.error ?? ''}\n${up.stdout}\n${up.stderr}`);

  const base = `http://127.0.0.1:${port}`;

  const page = await waitFor(`${base}/`);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await page.text(), /<div id="root">/);

  const deepLink = await waitFor(`${base}/queue`);
  assert.match(await deepLink.text(), /<div id="root">/, 'маршрут приложения должен отдавать index.html');

  const health = await (await waitFor(`${base}/api/health`)).json();
  assert.equal(health.status, 'ok');

  const asEmployee = { headers: { 'X-Demo-User': 'employee-1' } };
  const own = await (await waitFor(`${base}/api/complaints`, asEmployee)).json();
  assert.ok(own.items.length > 0, 'у сотрудника employee-1 есть обращения из seed');
  assert.ok(own.items.every((item) => item.author.id === 'employee-1'), 'сотрудник видит только свои');

  const asManager = { headers: { 'X-Demo-User': 'manager-1' } };
  const all = await (await waitFor(`${base}/api/complaints`, asManager)).json();
  assert.ok(all.total >= 20, `руководитель видит весь seed (total=${all.total})`);

  const summary = await (await waitFor(`${base}/api/summary`, { headers: { 'X-Demo-User': 'admin-1' } })).json();
  assert.ok(summary.total >= 20, 'сводка администратора считается по демо-данным');

  const denied = await fetch(`${base}/api/summary`, asEmployee);
  assert.equal(denied.status, 403, 'права проверяет сервер и внутри контейнера');
});

test('#58 README: шаги запуска, демо-логины ролей, реализовано / имитация / план', () => {
  const readme = readFileSync(new URL('../../infra/README.md', import.meta.url), 'utf8');
  assert.match(readme, /docker compose up/);
  for (const login of ['employee-1', 'employee-2', 'manager-1', 'admin-1']) {
    assert.ok(readme.includes(login), `в README есть демо-логин ${login}`);
  }
  for (const section of ['Реализовано', 'Имитация', 'План']) {
    assert.match(readme, new RegExp(`#+ .*${section}`), `в README есть раздел «${section}»`);
  }
});
