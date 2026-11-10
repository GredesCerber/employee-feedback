import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { childEnv, seedResetUnset } from './demo-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const help = `Запуск: node infra/run-demo.mjs [флаги]
Node >=22.12.0; Docker не нужен.
--api-port N   Порт API (по умолчанию свободный)
--web-port N   Порт веба (по умолчанию свободный)
--no-install   Не устанавливать отсутствующие зависимости
--seed-reset   Запустить с исходным seed в памяти; PERSIST_FILE игнорируется, файл не удаляется
--dry-run      Показать JSON-план без установки, сборки и запуска
--help         Эта справка
Ctrl+C останавливает оба сервера.`;
const options = {};
try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (['--api-port', '--web-port'].includes(flag)) {
      const value = args[++i];
      if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) throw new Error(`Некорректный порт: ${value}`);
      options[flag] = Number(value);
    } else if (['--no-install', '--seed-reset', '--dry-run', '--help'].includes(flag)) options[flag] = true;
    else throw new Error(`Неизвестный флаг: ${flag}`);
  }
  if (options['--help']) { console.log(help); process.exit(0); }
  if (options['--api-port'] && options['--api-port'] === options['--web-port']) throw new Error('API и веб требуют разных портов.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Нужен Node >=22.12.0.');
  await main();
} catch (error) { console.error(error.message); process.exitCode = 1; }

function npmCli() {
  const candidates = [process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    ...String(process.env.PATH ?? '').split(delimiter).flatMap(path => [join(path, 'node_modules/npm/bin/npm-cli.js'), join(path, '../lib/node_modules/npm/bin/npm-cli.js')])];
  const found = candidates.find(path => path && path.endsWith('.js') && existsSync(path));
  if (!found && !options['--dry-run']) throw new Error('npm-cli.js не найден. Установите Node вместе с npm.');
  return found ?? '<npm-cli.js from Node installation>';
}
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1');
  await once(server, 'listening'); const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose)); return port;
}
async function main() {
  const apiPort = options['--api-port'] ?? (options['--dry-run'] ? 3000 : await freePort());
  let webPort = options['--web-port'] ?? (options['--dry-run'] ? 5173 : await freePort());
  while (webPort === apiPort && !options['--web-port']) webPort = options['--dry-run'] ? apiPort + 1 : await freePort();
  if (webPort === apiPort) throw new Error('API и веб требуют разных портов.');
  const apiEnv = { HOST: '127.0.0.1', PORT: String(apiPort) };
  // --seed-reset: PERSIST_FILE исключается из окружения API целиком (не пустая строка), файл не трогается.
  const apiEnvUnset = seedResetUnset(Boolean(options['--seed-reset']));
  const webEnv = { DEMO_API_PORT: String(apiPort), DEMO_WEB_PORT: String(webPort) };
  const webBuildEnv = { VITE_API_BASE_URL: '/api' };
  const npm = npmCli();
  const commands = [];
  for (const folder of ['api', 'web']) {
    if (!options['--no-install'] && !existsSync(join(root, folder, 'node_modules'))) commands.push({ cmd: process.execPath, args: [npm, '--prefix', folder, 'ci', '--no-audit', '--no-fund'], shell: false });
    commands.push({ cmd: process.execPath, args: [npm, '--prefix', folder, 'run', 'build'], shell: false, env: folder === 'web' ? webBuildEnv : {} });
  }
  const servers = [
    { cmd: process.execPath, args: ['api/dist/server.js'], shell: false, env: apiEnv, unset: apiEnvUnset },
    { cmd: process.execPath, args: ['infra/serve-demo.mjs'], shell: false, env: webEnv },
  ];
  if (options['--dry-run']) { console.log(JSON.stringify({ apiPort, webPort, apiEnv, apiEnvUnset, webEnv, webBuildEnv, commands: [...commands, ...servers] }, null, 2)); return; }
  const children = new Set(); let stopping = false;
  async function stop() {
    if (stopping) return; stopping = true;
    const active = [...children];
    for (const child of active) child.kill('SIGTERM');
    await Promise.all(active.map(child => new Promise(resolveStop => {
      if (child.exitCode !== null || child.signalCode !== null) return resolveStop();
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('close', () => { clearTimeout(timer); resolveStop(); });
    })));
  }
  const signal = () => { void stop(); };
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  function start(command) {
    const child = spawn(command.cmd, command.args, { cwd: root, env: childEnv(process.env, command.env, command.unset), shell: false, windowsHide: true, stdio: 'inherit' });
    children.add(child); child.once('close', () => children.delete(child)); return child;
  }
  try {
    for (const command of commands) {
      if (stopping) return;
      const child = start(command); const [code] = await once(child, 'close');
      if (code !== 0) throw new Error(`Команда завершилась с кодом ${code}: ${command.args.slice(1).join(' ')}`);
    }
    if (stopping) return;
    const live = servers.map(start);
    for (const child of live) {
      child.once('error', error => { console.error(error.message); process.exitCode = 1; void stop(); });
      child.once('close', () => { if (!stopping) { console.error('Сервер завершился; останавливаю демо.'); process.exitCode = 1; void stop(); } });
    }
    for (const url of [`http://127.0.0.1:${apiPort}/health`, `http://127.0.0.1:${webPort}/api/health`]) {
      let ready = false;
      for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
        try { ready = (await fetch(url, { signal: AbortSignal.timeout(500) })).ok; } catch { /* startup retry */ }
        if (ready) break;
        await new Promise(resolveWait => setTimeout(resolveWait, 200));
      }
      if (!ready) throw new Error(`Сервис не готов: ${url}`);
    }
    console.log(`\nДемо: http://127.0.0.1:${webPort}\nAPI: http://127.0.0.1:${apiPort}/health\nCtrl+C — остановить оба сервера.`);
    await Promise.all(live.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : once(child, 'close')));
  } finally {
    await stop(); process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal);
  }
}
