import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import test from 'node:test';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('#101 dry run describes installation, builds, separate ports, proxy and seed reset without executing', () => {
  const result = spawnSync(process.execPath, ['infra/run-demo.mjs', '--dry-run', '--api-port', '43121', '--web-port', '43122', '--seed-reset'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.apiPort, 43121); assert.equal(plan.webPort, 43122);
  assert.ok(plan.commands.some(command => command.args.includes('build')));
  assert.ok(plan.commands.every(command => command.shell === false && Array.isArray(command.args)));
  assert.equal('PERSIST_FILE' in plan.apiEnv, false);
  assert.deepEqual(plan.apiEnvUnset, ['PERSIST_FILE']);
  assert.equal(plan.webEnv.DEMO_API_PORT, '43121');
  assert.equal(plan.webBuildEnv.VITE_API_BASE_URL, '/api');
  const noInstall = spawnSync(process.execPath, ['infra/run-demo.mjs', '--dry-run', '--no-install'], { cwd: root, encoding: 'utf8' });
  assert.equal(noInstall.status, 0);
  assert.ok(!JSON.parse(noInstall.stdout).commands.some(command => command.args.includes('ci')));
});
test('#101 help documents every flag and invalid ports fail clearly', () => {
  const help = spawnSync(process.execPath, ['infra/run-demo.mjs', '--help'], { cwd: root, encoding: 'utf8' });
  for (const flag of ['--api-port', '--web-port', '--no-install', '--seed-reset', '--dry-run']) assert.ok(help.stdout.includes(flag));
  for (const args of [['--api-port', 'bad'], ['--web-port', '70000'], ['--unknown'], ['--api-port', '4000', '--web-port', '4000']]) {
    assert.notEqual(spawnSync(process.execPath, ['infra/run-demo.mjs', ...args], { cwd: root, encoding: 'utf8' }).status, 0);
  }
});
test('#101 built web serves SPA and proxies to the selected API; closing releases ports', async t => {
  const { createDemoServer } = await import('../../infra/serve-demo.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'ef-demo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'index.html'), '<html>demo shell</html>');
  const api = createServer((request, response) => response.end(JSON.stringify({ status: 'ok', url: request.url })));
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => api.close());
  const web = createDemoServer({ directory, apiPort: api.address().port });
  await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
  t.after(() => web.close());
  const port = web.address().port;
  const base = `http://127.0.0.1:${port}`;
  assert.match(await (await fetch(`${base}/complaints/abc`)).text(), /demo shell/);
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', url: '/health' });
  assert.equal((await fetch(`${base}/apiary`)).status, 200);
  await new Promise(resolve => web.close(resolve));
  const replacement = createServer();
  await new Promise((resolve, reject) => replacement.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => replacement.close(resolve));
});
