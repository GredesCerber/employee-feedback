// #299: корневой README для жюри — описание, экраны, запуск, честные ограничения, интеграции, проверка ссылок.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const sections = readme.split(/^## /m);
const section = title => {
  const found = sections.find(part => part.startsWith(title));
  assert.ok(found, `в README есть раздел «${title}»`);
  return found;
};

test('#299 начало README: проблема, ценность, три роли, путь, оглавление; без инструкций агентам', () => {
  const intro = readme.slice(0, readme.indexOf('\n## ', readme.indexOf('## Содержание') + 1));
  assert.match(intro, /проблем/i, 'в начале описана проблема');
  for (const role of ['Сотрудник', 'Руководитель', 'Администратор']) assert.ok(intro.includes(role), `в начале есть роль ${role}`);
  assert.match(intro, /## Содержание/, 'есть оглавление');
  const toc = section('Содержание');
  for (const anchor of toc.matchAll(/\]\(#([^)]+)\)/g)) {
    const heading = readme.split('\n').filter(line => /^#{2,3} /.test(line))
      .map(line => line.replace(/^#+ /, '').toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-'));
    assert.ok(heading.includes(anchor[1]), `якорь оглавления #${anchor[1]} ведёт на заголовок`);
  }
  assert.doesNotMatch(readme, /hk task|hk commit|HK_AGENT|next_actions/, 'нет внутренних инструкций агентам');
});

test('#299 экраны: минимум пять реальных скриншотов из infra/screenshots с подписями и alt', () => {
  const screens = section('Экраны');
  const images = [...screens.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  assert.ok(images.length >= 5, `скриншотов: ${images.length}`);
  for (const [, alt, path] of images) {
    assert.ok(alt.trim().length >= 10, `alt-текст у ${path}`);
    assert.match(path, /^infra\/screenshots\/[\w-]+\.png$/, `относительный путь ${path}`);
    const file = join(root, path);
    assert.ok(existsSync(file) && statSync(file).size > 10_000, `файл ${path} существует`);
    assert.equal(readFileSync(file).subarray(1, 4).toString('latin1'), 'PNG', `${path} — PNG`);
  }
  const text = screens.toLowerCase();
  for (const word of ['подача', 'мои обращения', 'истори', 'очередь', 'сводка']) assert.ok(text.includes(word), `подпись про «${word}»`);
});

test('#299 запуск: команда, health, остановка, тесты, роли, порты, хранение данных', () => {
  const run = section('Запуск');
  for (const needle of ['npm run demo', '/api/health', 'Ctrl+C', 'docker compose up --build', 'docker compose down', 'Node.js']) {
    assert.ok(run.includes(needle), `в разделе запуска есть ${needle}`);
  }
  assert.match(run, /порт/i);
  assert.match(run, /PERSIST_FILE/);
  assert.match(run, /DATABASE_URL/);
  const tests = section('Тесты');
  for (const needle of ['npm --prefix api test', 'npm --prefix web test', 'node --test', 'test:e2e']) assert.ok(tests.includes(needle), `тесты: ${needle}`);
  for (const login of ['employee-1', 'manager-1', 'admin-1']) assert.ok(readme.includes(login), `роль ${login}`);
});

test('#299 ограничения: реализовано, имитации и планы разделены; ключевые темы описаны', () => {
  const honest = section('Что реализовано');
  for (const heading of ['### Реализовано', '### Демо-имитации', '### Планы']) assert.ok(honest.includes(heading), heading);
  const simulated = honest.slice(honest.indexOf('### Демо-имитации'), honest.indexOf('### Планы'));
  for (const topic of ['Вход', 'Вложения', 'Хранение', 'ИИ', 'Уведомления']) assert.ok(simulated.includes(topic), `имитация: ${topic}`);
  assert.doesNotMatch(readme, /Уведомлений нет|Анонимная подача \(описана/, 'нет устаревших заявлений');
});

test('#299 интеграции 1С и Битрикс24: необязательны, облачный Битрикс24, интеграций нет, обмен — план', () => {
  const part = section('Интеграции');
  assert.match(part, /не обязательн/i);
  assert.match(part, /облачн\S* Битрикс24/i);
  assert.match(part, /1С/);
  assert.match(part, /нет|отсутству/i);
  assert.match(part, /план/i);
  assert.match(part, /неизвестн|не известн/i);
});

test('#299 ссылки и безопасность: нет битых локальных ссылок, localhost как демо, токенов; есть протокол проверки', () => {
  for (const [, target] of readme.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = normalize(join(root, target.split('#')[0]));
    assert.ok(existsSync(path), `локальная ссылка ${target} существует`);
  }
  assert.doesNotMatch(readme, /\]\(https?:\/\/(localhost|127\.0\.0\.1)/, 'localhost не подаётся как публичная ссылка');
  const demo = readme.split(/\r?\n\r?\n/)[1] ?? '';
  assert.match(demo, /\]\(https:\/\/employee-feedback-x627\.onrender\.com\/\)/, 'публичное демо в первом блоке');
  for (const role of ['Сотрудник закупок', 'Руководитель', 'Администратор']) {
    assert.ok(demo.includes(role), `в первом блоке есть демо-учётка ${role}`);
  }
  assert.doesNotMatch(readme, /sk-ant-|ghp_|github_pat_|@[\w.-]+\.(ru|com)\b/, 'нет токенов и почты');
  const validation = join(root, 'infra/readme-validation.md');
  assert.ok(existsSync(validation), 'есть infra/readme-validation.md');
  const log = readFileSync(validation, 'utf8');
  assert.match(log, /\b[0-9a-f]{40}\b/, 'записан SHA');
  assert.match(log, /npm run demo/);
  assert.match(log, /200/);
  assert.ok(existsSync(join(dirname(validation), 'screenshots/capture.mjs')), 'скрипт снятия скриншотов в репозитории');
});
