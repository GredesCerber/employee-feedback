import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

// Deliberately restricted YAML subset: nested mappings and lists of mappings,
// two-space indentation, plain/JSON-quoted scalar values. Reject unsupported syntax.
function parseYaml(source) {
  const lines = source.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'));
  let index = 0;
  function block(indent) {
    const list = lines[index]?.trimStart().startsWith('- ');
    const result = list ? [] : {};
    let target = result;
    while (index < lines.length) {
      const line = lines[index];
      const spaces = line.length - line.trimStart().length;
      if (spaces < indent) break;
      let text = line.trimStart();
      if (list && spaces === indent && text.startsWith('- ')) {
        target = {}; result.push(target); text = text.slice(2);
      } else assert.equal(spaces, list ? indent + 2 : indent, `indent: ${line}`);
      const match = /^([A-Za-z][\w]*):(?: (.*))?$/.exec(text);
      assert.ok(match, `unsupported YAML: ${line}`);
      const [, key, raw] = match;
      assert.ok(!Object.hasOwn(target, key), `duplicate key ${key}`);
      index++;
      if (raw === undefined) {
        assert.ok(index < lines.length, `empty ${key}`);
        target[key] = block((list ? indent + 2 : indent) + 2);
      } else if (raw.startsWith('"')) target[key] = JSON.parse(raw);
      else { assert.ok(!/[\[\]{}&*!|>]/.test(raw), `unsupported scalar ${key}`); target[key] = raw; }
    }
    return result;
  }
  return block(0);
}

test('104 Render blueprint has repository-root API commands, health and documented environment', () => {
  const { services } = parseYaml(read('infra/deploy/render.yaml'));
  assert.equal(services.length, 1);
  const api = services[0];
  assert.equal(api.type, 'web');
  assert.equal(api.runtime, 'node');
  assert.equal(api.rootDir, undefined, 'API needs contracts outside api/');
  assert.equal(api.buildCommand, 'npm --prefix api ci && npm --prefix api run build');
  assert.equal(api.startCommand, 'npm --prefix api start');
  assert.equal(api.healthCheckPath, '/health');
  assert.equal(api.autoDeployTrigger, 'off');
  const pkg = JSON.parse(read('api/package.json'));
  assert.ok(pkg.scripts.build && pkg.scripts.start);
  assert.ok(existsSync(new URL('api/package-lock.json', root)));
  const env = Object.fromEntries(api.envVars.map(({ key, value }) => [key, value]));
  assert.equal(env.HOST, '0.0.0.0');
  assert.equal(env.NODE_ENV, 'production');
  for (const name of Object.keys(env)) assert.ok(read('infra/ENV.md').includes('`' + name + '`'), name);
});

test('104 Vercel installs/builds web and serves SPA routes', () => {
  const config = JSON.parse(read('infra/deploy/vercel.json'));
  assert.equal(config.installCommand, 'npm --prefix web ci');
  assert.equal(config.buildCommand, 'npm --prefix web run build');
  assert.equal(config.outputDirectory, 'web/dist');
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
  assert.ok(JSON.parse(read('web/package.json')).scripts.build);
  assert.ok(existsSync(new URL('web/package-lock.json', root)));
  assert.match(read('infra/deploy/README.md'), /VITE_API_BASE_URL/);
});

test('104 deployment guide includes setup, validation, rollback and human-only publication', () => {
  const guide = read('infra/deploy/README.md');
  for (const heading of ['1. Подготовка', '2. Render', '3. Vercel', '4. Проверка', '5. Откат']) assert.ok(guide.includes(heading), heading);
  assert.match(guide, /деплой наружу делает только человек/i);
  assert.match(guide, /--local-config infra\/deploy\/vercel.json/);
  assert.match(guide, /\/health/);
  assert.match(guide, /предыдущ/);
  assert.match(guide, /CORS/);
  const files = ['infra/deploy/render.yaml', 'infra/deploy/vercel.json', 'infra/deploy/README.md', 'infra/ENV.md'];
  for (const file of files) {
    assert.doesNotMatch(read(file), /(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|BEGIN (?:RSA )?PRIVATE KEY)/, file);
  }
});
