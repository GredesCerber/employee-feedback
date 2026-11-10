import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../infra/make-submission-archive.mjs', import.meta.url));
function fixture(t, ignored = true) {
  const cwd = mkdtempSync(join(tmpdir(), 'submission-103-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = args => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  git(['init', '--quiet']);
  const files = {
    '.gitignore': `node_modules/\ndist/\n.env\n.env.*\n!.env.example\n${ignored ? 'submission/\n' : ''}`,
    'README.md': 'committed contents',
    'api/source.js': 'export const ok = true;',
    '.env.example': 'DEMO_URL=\n',
    'api/.env': 'PRIVATE_VALUE=placeholder',
    'web/.env.local': 'PRIVATE_VALUE=placeholder',
    'web/node_modules/fake.js': 'dependency',
    'web/dist/index.html': 'generated',
    'submission/old.zip': 'old artifact',
  };
  for (const [path, text] of Object.entries(files)) {
    const full = join(cwd, path); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, text);
  }
  // Force-add junk: the exporter must filter even accidentally tracked artifacts.
  git(['add', '--force', '.']);
  git(['-c', 'user.name=Archive fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  return { cwd, git };
}
function zipEntries(buffer) {
  const names = [];
  for (let pos = 0; pos + 46 <= buffer.length; pos++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) continue;
    const length = buffer.readUInt16LE(pos + 28);
    names.push(buffer.subarray(pos + 46, pos + 46 + length).toString('utf8'));
    pos += 45 + length + buffer.readUInt16LE(pos + 30) + buffer.readUInt16LE(pos + 32);
  }
  return names;
}

test('103 archive uses committed HEAD and excludes generated files, secrets and earlier archives', async t => {
  const { cwd, git } = fixture(t);
  writeFileSync(join(cwd, 'README.md'), 'uncommitted change');
  writeFileSync(join(cwd, 'untracked.txt'), 'not committed');
  const { createSubmissionArchive } = await import(script);
  const messages = [];
  const result = createSubmissionArchive({ cwd, log: text => messages.push(text) });
  assert.equal(result.exitCode, 0);
  assert.match(result.path, /submission[\\/]employee-feedback-.*\.zip$/);
  const names = zipEntries(readFileSync(result.path));
  assert.ok(names.includes('README.md')); assert.ok(names.includes('api/source.js'));
  assert.ok(names.includes('.env.example'));
  assert.ok(!names.some(name => /(?:node_modules|dist|submission)\//.test(name) || /(?:^|\/)\.env(?:\.(?!example$).*)?$/.test(name) || name === 'untracked.txt'));
  assert.ok(messages.some(line => /только закоммиченное/.test(line)));
  assert.ok(messages.some(line => /✓.*МБ/.test(line)));
  // A clean comparison archive proves README comes from HEAD, not the dirty working file.
  assert.equal(git(['show', 'HEAD:README.md']), 'committed contents');
  assert.ok(!readFileSync(result.path).includes(Buffer.from('uncommitted change')));
});

test('103 warns when submission is not ignored and CLI runs without shell', async t => {
  const { cwd } = fixture(t, false);
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /submission\/.*не исключена/);
  assert.match(result.stdout, /✓.*МБ/);
});

test('103 size limit is exactly 100 decimal MB and excess returns failure', async () => {
  const { archiveSizeResult } = await import(script);
  assert.equal(archiveSizeResult(100_000_000).exitCode, 0);
  const tooLarge = archiveSizeResult(100_000_001);
  assert.equal(tooLarge.exitCode, 1);
  assert.match(tooLarge.message, /✗.*100.*МБ/);
});
