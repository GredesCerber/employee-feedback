import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const script = fileURLToPath(new URL('../../infra/check-submission.mjs', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ef-submission-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  spawnSync('git', ['init', root]);
  for (const folder of ['docs', 'contracts', 'infra']) await mkdir(join(root, folder));
  for (const [path, body] of Object.entries({ 'README.md': 'https://example.test/private?secret=redacted', 'docs/prd.md': 'Plan', 'contracts/api.yaml': '{}', 'infra/README.md': 'Запуск: node api.js\nСценарий демо: подать обращение' })) await writeFile(join(root, path), body);
  spawnSync('git', ['add', '.'], { cwd: root });
  return root;
}
const run = root => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
test('#102 valid tracked files pass, report URLs without network or query values', async t => {
  const root = await fixture(t), result = run(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /✓/); assert.match(result.stdout, /example\.test\/private/);
  assert.doesNotMatch(result.stdout, /secret=redacted/);
  assert.match(result.stdout, /чужого аккаунта/);
});
test('#102 detects fake credentials and nonempty env values without printing values', async t => {
  const root = await fixture(t);
  const token = ['ghp', '_', 'A'.repeat(36)].join('');
  await writeFile(join(root, 'leak.txt'), `first line\n${token}\n`);
  await writeFile(join(root, '.env.local'), 'PRIVATE_VALUE=do-not-print-this\n');
  spawnSync('git', ['add', '.'], { cwd: root });
  const result = run(root);
  assert.equal(result.status, 1); assert.match(result.stdout, /leak\.txt:2/); assert.match(result.stdout, /\.env\.local:1/);
  assert.ok(!result.stdout.includes(token)); assert.ok(!result.stdout.includes('do-not-print-this'));
});
test('#102 tracked size over 100 MB fails, reports largest files and excludes generated directories', async t => {
  const root = await fixture(t);
  const file = await open(join(root, 'large.bin'), 'w');
  await file.truncate(100_000_001); await file.close();
  spawnSync('git', ['add', 'large.bin'], { cwd: root });
  const result = run(root);
  assert.equal(result.status, 1); assert.match(result.stdout, /✗.*100/); assert.match(result.stdout, /large\.bin/);
});
test('#102 missing required documentation fails even with otherwise clean files', async t => {
  const root = await fixture(t);
  await rm(join(root, 'contracts/api.yaml'));
  const result = run(root);
  assert.equal(result.status, 1); assert.match(result.stdout, /✗.*contracts\/api.yaml/);
});
