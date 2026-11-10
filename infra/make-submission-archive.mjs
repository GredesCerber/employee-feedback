import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 100_000_000;

export function archiveSizeResult(bytes) {
  const valid = bytes <= MAX_BYTES;
  return {
    exitCode: valid ? 0 : 1,
    message: `${valid ? '✓' : '✗'} Архив: ${(bytes / 1_000_000).toFixed(2)} МБ (${bytes} байт); предел 100 МБ${valid ? '' : ' превышен'}.`,
  };
}

export function createSubmissionArchive({ cwd = process.cwd(), log = console.log } = {}) {
  const git = (args, directory = cwd) => execFileSync('git', args, {
    cwd: directory, encoding: 'utf8', shell: false, windowsHide: true,
    maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const root = git(['rev-parse', '--show-toplevel']).trim();
  git(['rev-parse', '--verify', 'HEAD'], root);
  const ignored = spawnSync('git', ['check-ignore', '--quiet', 'submission/__archive_check__.zip'], {
    cwd: root, shell: false, windowsHide: true, encoding: 'utf8',
  });
  if (ignored.error || ![0, 1].includes(ignored.status)) throw new Error('Не удалось проверить .gitignore.');
  if (ignored.status === 1) log('Предупреждение: submission/ не исключена в .gitignore; добавьте строку submission/.');
  if (git(['status', '--porcelain'], root).trim()) {
    log('Предупреждение: есть незакоммиченные изменения; в архив попадёт только закоммиченное состояние HEAD.');
  }
  const tracked = git(['ls-tree', '-r', '--name-only', '-z', 'HEAD'], root).split('\0').filter(Boolean);
  const excludedEnv = tracked.filter(path => {
    const name = basename(path);
    return name === '.env' || (name.startsWith('.env.') && name !== '.env.example');
  });
  const outputDir = join(root, 'submission');
  if (existsSync(outputDir) && (lstatSync(outputDir).isSymbolicLink() || !lstatSync(outputDir).isDirectory())) {
    throw new Error('submission/ должна быть обычной папкой внутри репозитория.');
  }
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replace('.', '-');
  let archive = join(outputDir, `employee-feedback-${stamp}.zip`);
  for (let suffix = 1; existsSync(archive); suffix++) archive = join(outputDir, `employee-feedback-${stamp}-${suffix}.zip`);
  const partial = join(outputDir, `.archive-${randomUUID()}.tmp`);
  try {
    git(['archive', '--format=zip', '-o', partial, 'HEAD', '--', '.',
      ':(glob,exclude)**/node_modules/**', ':(glob,exclude)**/dist/**',
      ':(glob,exclude)submission/**', ...excludedEnv.map(path => `:(literal,exclude)${path}`)], root);
    renameSync(partial, archive);
  } finally {
    // Only our uniquely named partial file; never remove a directory or existing archive.
    rmSync(partial, { force: true });
  }
  const bytes = statSync(archive).size;
  const result = archiveSizeResult(bytes);
  log(result.message);
  log(`Файл: ${archive}`);
  return { path: archive, bytes, ...result };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = createSubmissionArchive().exitCode; }
  catch (error) { console.error(`✗ Архив не создан: ${error.message}`); process.exitCode = 1; }
}
