import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, repo), 'utf8');
function npmCli() {
  const dirs = [dirname(process.execPath), ...String(process.env.PATH ?? '').split(delimiter)];
  const candidates = [process.env.npm_execpath, ...dirs.flatMap(dir => [join(dir, 'node_modules/npm/bin/npm-cli.js'), join(dir, '../lib/node_modules/npm/bin/npm-cli.js')])];
  const found = candidates.find(path => path && path.endsWith('.js') && existsSync(path));
  assert.ok(found, 'npm bundled with Node is required for the offline fixture');
  return found;
}
const npm = npmCli();
function fixture(t, folder) {
  const dir = mkdtempSync(join(tmpdir(), 'production-build-187-'));
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, folder)); mkdirSync(join(dir, 'build-tool'));
  writeFileSync(join(dir, '.npmrc'), ''); writeFileSync(join(dir, 'global.npmrc'), '');
  writeFileSync(join(dir, 'build-tool/package.json'), JSON.stringify({ name: 'local-build-tool', version: '1.0.0', main: 'index.cjs' }));
  writeFileSync(join(dir, 'build-tool/index.cjs'), "module.exports = 'dev-only tool available';");
  writeFileSync(join(dir, folder, 'package.json'), JSON.stringify({
    name: 'offline-production-fixture', version: '1.0.0', private: true,
    scripts: { build: 'node build.cjs' }, devDependencies: { 'local-build-tool': 'file:../build-tool' },
  }));
  writeFileSync(join(dir, folder, 'build.cjs'), "require('node:assert/strict').equal(process.env.NODE_ENV, 'production'); require('node:fs').writeFileSync('build-result.txt', require('local-build-tool'));");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key) && key.toUpperCase() !== 'NODE_ENV'));
  Object.assign(env, {
    NODE_ENV: 'production', npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
    npm_config_userconfig: join(dir, '.npmrc'), npm_config_globalconfig: join(dir, 'global.npmrc'),
    npm_config_cache: join(dir, '.npm-cache'),
  });
  const run = args => spawnSync(process.execPath, [npm, ...args], {
    cwd: dir, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 30_000,
  });
  const lock = run(['--prefix', folder, 'install', '--package-lock-only', '--ignore-scripts', '--include=dev']);
  assert.equal(lock.status, 0, lock.stderr);
  assert.ok(!existsSync(join(dir, folder, 'node_modules')), 'fixture starts without dependencies');
  return { dir, run };
}
function commandArgs(command) {
  const parts = command.split(/\s+/);
  assert.equal(parts.shift(), 'npm');
  assert.ok(parts.every(part => /^[\w=.-]+$/.test(part)), 'only plain npm argument arrays, no shell');
  return parts;
}
function renderCommands() {
  const match = /^    buildCommand: (".*")$/m.exec(read('infra/deploy/render.yaml'));
  assert.ok(match, 'explicit Render build command');
  return JSON.parse(match[1]).split(' && ');
}

test('187 actual Render install/build commands retain a dev-only build tool under production', t => {
  const { dir, run } = fixture(t, 'api');
  // Negative control: this fixture reproduces the original production omission.
  assert.equal(run(['--prefix', 'api', 'ci']).status, 0);
  assert.notEqual(run(['--prefix', 'api', 'run', 'build']).status, 0);
  for (const command of renderCommands()) {
    const result = run(commandArgs(command)); assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(readFileSync(join(dir, 'api/build-result.txt'), 'utf8'), 'dev-only tool available');
  assert.match(read('infra/deploy/render.yaml'), /key: NODE_ENV\r?\n\s+value: production/);
});

test('187 actual Vercel commands build from a clean production fixture without network', t => {
  const { dir, run } = fixture(t, 'web');
  const config = JSON.parse(read('infra/deploy/vercel.json'));
  for (const command of [config.installCommand, config.buildCommand]) {
    const result = run(commandArgs(command)); assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(readFileSync(join(dir, 'web/build-result.txt'), 'utf8'), 'dev-only tool available');
});

test('187 deployment guide lists the exact production-safe install commands', () => {
  const guide = read('infra/deploy/README.md');
  assert.ok(guide.includes(renderCommands()[0]));
  assert.ok(guide.includes(JSON.parse(read('infra/deploy/vercel.json')).installCommand));
  assert.match(guide, /devDependencies/);
  assert.match(guide, /NODE_ENV=production/);
});
