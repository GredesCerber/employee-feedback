#!/usr/bin/env node
// Сверка переменных окружения в коде с infra/ENV.md (#105). Без сети и без зависимостей.
// Запуск: node infra/check-env.mjs — код выхода 1 и список расхождений, если они есть.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Где ищем чтение env. Каталоги обходятся рекурсивно, node_modules и dist пропускаются. */
export const SCAN_PATHS = ['api/src', 'web/src', 'web/vite.config.ts', 'infra', 'docker-compose.yml'];
/** Файлы-примеры, значения в которых должны быть пустыми. */
export const ENV_EXAMPLES = ['api/.env.example', 'web/.env.example'];
/** Системные переменные, которые выставляют ОС и npm, а не мы: в ENV.md не описываются. */
export const SYSTEM_VARS = new Set(['PATH', 'npm_execpath']);

/** Сам сканер содержит шаблоны process.env в тексте, его не сканируем. */
const SELF = 'infra/check-env.mjs';
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const NAME = '[A-Za-z_][A-Za-z0-9_]*';

function walk(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    return walk(join(path, entry.name));
  });
}

/** Имена переменных, которые читает один файл кода. Нераскрытое динамическое чтение попадает в `unresolved`. */
export function envNamesInCode(text) {
  const names = new Set();
  const unresolved = [];
  for (const m of text.matchAll(new RegExp(`process\\.env\\.(${NAME})`, 'g'))) names.add(m[1]);
  for (const m of text.matchAll(new RegExp(`import\\.meta\\.env\\.(${NAME})`, 'g'))) names.add(m[1]);
  for (const m of text.matchAll(new RegExp(`process\\.env\\[\\s*['"\`](${NAME})['"\`]\\s*\\]`, 'g'))) names.add(m[1]);
  // process.env[param] внутри функции-помощника: собираем строковые первые аргументы её вызовов.
  for (const m of text.matchAll(new RegExp(`process\\.env\\[\\s*(${NAME})\\s*\\]`, 'g'))) {
    const param = m[1];
    const before = text.slice(0, m.index);
    const fn = [...before.matchAll(new RegExp(`function\\s+(${NAME})\\s*\\(\\s*${param}\\b`, 'g'))].pop();
    const calls = fn ? [...text.matchAll(new RegExp(`\\b${fn[1]}\\(\\s*['"\`](${NAME})['"\`]`, 'g'))] : [];
    if (calls.length === 0) unresolved.push(`process.env[${param}]`);
    for (const call of calls) names.add(call[1]);
  }
  return { names, unresolved };
}

/** Переменные из docker-compose: подстановки ${VAR} и ключи блоков environment. */
export function envNamesInCompose(text) {
  const names = new Set();
  for (const m of text.matchAll(new RegExp(`\\$\\{(${NAME})`, 'g'))) names.add(m[1]);
  let indent = -1;
  for (const line of text.split(/\r?\n/)) {
    const current = line.search(/\S/);
    if (current === -1 || line.trimStart().startsWith('#')) continue;
    if (indent >= 0 && current > indent) {
      const key = line.match(new RegExp(`^\\s*(?:-\\s*)?(${NAME})\\s*[:=]`));
      if (key) names.add(key[1]);
      continue;
    }
    indent = /^\s*environment:\s*$/.test(line) ? current : -1;
  }
  return names;
}

/** Строки `KEY=VALUE` из .env.example. */
export function parseEnvExample(text) {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const at = line.indexOf('=');
      return at === -1 ? { name: line, value: '' } : { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    });
}

/** Строки таблицы ENV.md: | `NAME` | где | по умолчанию | обязательна | статус |. */
export function parseEnvDoc(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\|\\s*\`(${NAME})\`\\s*\\|(.*)\\|\\s*$`));
    if (!m) continue;
    const cells = m[2].split('|').map(cell => cell.trim());
    rows.set(m[1], { where: cells[0] ?? '', default: cells[1] ?? '', required: cells[2] ?? '', status: cells[3] ?? '' });
  }
  return rows;
}

/** Все переменные, которые читает код и инфраструктура: имя → файлы. */
export function collectEnvUsage(root) {
  const usage = new Map();
  const unresolved = [];
  const add = (name, file) => {
    if (SYSTEM_VARS.has(name)) return;
    if (!usage.has(name)) usage.set(name, new Set());
    usage.get(name).add(file);
  };
  for (const scan of SCAN_PATHS) {
    for (const file of walk(join(root, scan))) {
      const rel = relative(root, file).split(sep).join('/');
      const text = readFileSync(file, 'utf8');
      if (/docker-compose\.ya?ml$/.test(rel)) { for (const name of envNamesInCompose(text)) add(name, rel); continue; }
      if (!CODE_FILE.test(rel) || rel === SELF) continue;
      const found = envNamesInCode(text);
      for (const name of found.names) add(name, rel);
      for (const item of found.unresolved) unresolved.push(`${rel}: ${item}`);
    }
  }
  for (const example of ENV_EXAMPLES) {
    const file = join(root, example);
    if (existsSync(file)) for (const { name } of parseEnvExample(readFileSync(file, 'utf8'))) add(name, example);
  }
  return { usage, unresolved };
}

/** Сравнение кода и ENV.md. Возвращает списки проблем; пустые списки — всё сходится. */
export function checkEnv(root) {
  const docPath = join(root, 'infra/ENV.md');
  const doc = existsSync(docPath) ? parseEnvDoc(readFileSync(docPath, 'utf8')) : new Map();
  const { usage, unresolved } = collectEnvUsage(root);
  const undocumented = [...usage.keys()].filter(name => !doc.has(name))
    .sort().map(name => `${name} (${[...usage.get(name)].sort().join(', ')})`);
  const incomplete = [...doc].filter(([, row]) => !row.where || !row.default || !row.required)
    .map(([name]) => name).sort();
  const stale = [...doc].filter(([name, row]) => !usage.has(name) && !/планируется/i.test(row.status))
    .map(([name]) => name).sort();
  const nonEmptyExamples = [];
  for (const example of ENV_EXAMPLES) {
    const file = join(root, example);
    if (!existsSync(file)) continue;
    for (const { name, value } of parseEnvExample(readFileSync(file, 'utf8'))) {
      if (value !== '') nonEmptyExamples.push(`${example}: ${name}`);
    }
  }
  return { undocumented, incomplete, stale, nonEmptyExamples, unresolved };
}

export function formatProblems(result) {
  const lines = [];
  if (result.undocumented.length) lines.push('Нет в infra/ENV.md (добавьте строку):', ...result.undocumented.map(x => `  - ${x}`));
  if (result.incomplete.length) lines.push('В infra/ENV.md не заполнены «где», «по умолчанию» или «обязательна»:', ...result.incomplete.map(x => `  - ${x}`));
  if (result.stale.length) lines.push('Есть в infra/ENV.md, но код их не читает (уберите или пометьте «планируется»):', ...result.stale.map(x => `  - ${x}`));
  if (result.nonEmptyExamples.length) lines.push('В .env.example должны быть пустые значения:', ...result.nonEmptyExamples.map(x => `  - ${x}`));
  if (result.unresolved.length) lines.push('Динамическое чтение env, имя не определить (читайте по явному имени):', ...result.unresolved.map(x => `  - ${x}`));
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const report = formatProblems(checkEnv(root));
  if (report) { console.error(report); process.exitCode = 1; } else console.log('infra/ENV.md совпадает с кодом');
}
