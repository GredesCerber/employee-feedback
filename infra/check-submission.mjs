import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const limit = 100_000_000;
const patterns = [
  ['API key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g],
];
const findings = new Set(), links = new Set();
function scan(text, file, startingLine, envFile) {
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) findings.add(`${file}:${startingLine + text.slice(0, match.index).split('\n').length - 1} (${kind})`);
  }
  if (envFile) {
    for (const match of text.matchAll(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*([^\r\n]*)/gm)) {
      const value = match[1].trim();
      if (value && !['""', "''"].includes(value) && !value.startsWith('#')) findings.add(`${file}:${startingLine + text.slice(0, match.index).split('\n').length - 1} (nonempty env)`);
    }
  }
  if (file.startsWith('docs/') || /^readme(?:\.|$)/i.test(basename(file))) {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'`)]+/g)) {
      if (patterns.some(([, re]) => { re.lastIndex = 0; return re.test(match[0]); })) continue;
      try { const url = new URL(match[0]); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; links.add(url.href); } catch { /* incomplete chunk or invalid link */ }
    }
  }
}
try {
  const git = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: false });
  if (git.status !== 0) throw new Error('Нужен git-репозиторий; список отслеживаемых файлов недоступен.');
  const tracked = git.stdout.split('\0').filter(Boolean);
  const files = [], problems = []; let total = 0;
  for (const file of tracked) {
    if (file.split('/').some(part => ['node_modules', 'dist', '.git'].includes(part))) continue;
    try {
      const stat = await lstat(file);
      if (!stat.isFile()) { problems.push(`${file}: не обычный файл (символические ссылки не читаются)`); continue; }
      total += stat.size; files.push({ file, size: stat.size });
      let tail = '', line = 1;
      const envFile = basename(file).startsWith('.env') && basename(file) !== '.env.example';
      for await (const chunk of createReadStream(file, { encoding: 'utf8', highWaterMark: 64 * 1024 })) {
        const text = tail + chunk;
        scan(text, file, line, envFile);
        const keep = text.slice(-2048);
        line += text.slice(0, text.length - keep.length).split('\n').length - 1;
        tail = keep;
      }
    } catch { problems.push(`${file}: файл недоступен`); }
  }
  let failed = false;
  const report = (ok, message) => { console.log(`${ok ? '✓' : '✗'} ${message}`); if (!ok) failed = true; };
  report(total <= limit, `Размер отслеживаемых файлов: ${(total / 1_000_000).toFixed(2)} МБ / 100 МБ (node_modules и dist исключены)`);
  console.log('Топ-10 по размеру:');
  for (const { file, size } of files.sort((a, b) => b.size - a.size).slice(0, 10)) console.log(`  ${(size / 1_000_000).toFixed(3)} МБ  ${file}`);
  report(problems.length === 0, 'Все учитываемые git-файлы доступны и являются обычными файлами');
  for (const problem of problems) console.log(`  ${problem}`);
  report(findings.size === 0, 'Проверка похожих на секреты значений (значения не выводятся)');
  for (const finding of [...findings].sort()) console.log(`  ${finding}`);
  for (const file of ['README.md', 'docs/prd.md', 'contracts/api.yaml', 'infra/README.md']) {
    report(files.some(entry => entry.file === file), `Обязательный документ: ${file}`);
  }
  let instructions = '';
  try { instructions = await readFile(join('infra', 'README.md'), 'utf8'); } catch { /* reported above */ }
  report(/запуск|run|start/i.test(instructions), 'Есть инструкция запуска');
  report(/сценарий.{0,30}демо|demo.{0,30}(scenario|walkthrough)/i.test(instructions), 'Есть сценарий демо');
  console.log('Ссылки из README/docs (без сетевой проверки; параметры и учётные данные скрыты):');
  for (const link of [...links].sort()) console.log(`  ${link}`);
  console.log('Откройте ссылки из чужого аккаунта перед сдачей. Проверка не меняет видимость и ничего не отправляет.');
  process.exitCode = failed ? 1 : 0;
} catch (error) { console.error(`✗ ${error.message}`); process.exitCode = 1; }
