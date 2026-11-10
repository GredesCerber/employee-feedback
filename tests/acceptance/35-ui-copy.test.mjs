import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const map = read('design/flows/screen-map.md');
const copy = read('design/ui-copy/ui-copy.md');
const screens = [...map.match(/```mermaid\n([\s\S]*?)```/)[1].matchAll(/^\s*(\w+)\["/gm)].map(m => m[1]);
const KINDS = ['Заголовки', 'Кнопки', 'Подсказки', 'Ошибки', 'Пустое состояние'];

/** Раздел экрана: от «## … (`id`)» до следующего «## ». */
function section(id) {
  const start = copy.search(new RegExp(`^## .*\\(\`${id}\`\\)\\s*$`, 'm'));
  if (start === -1) return null;
  const rest = copy.slice(start + 3);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}
/** Тексты подраздела: первая строка в обратных кавычках у каждого пункта списка. */
function texts(body, kind) {
  const part = body.split(new RegExp(`^### ${kind}\\s*$`, 'm'))[1]?.split(/^#{2,3} /m)[0] ?? '';
  return [...part.matchAll(/^- `([^`]+)`/gm)].map(m => m[1]);
}
const all = kind => screens.flatMap(id => texts(section(id) ?? '', kind));

test('#35 every screen of the screen map has headings, buttons, hints, errors and an empty state', () => {
  assert.ok(screens.length >= 9, 'карта экранов прочитана');
  const missing = [];
  for (const id of screens) {
    const body = section(id);
    if (!body) { missing.push(`${id}: нет раздела`); continue; }
    for (const kind of KINDS) if (texts(body, kind).length === 0) missing.push(`${id}: пусто в «${kind}»`);
  }
  assert.deepEqual(missing, []);
});

test('#35 tone is uniform: polite «вы», no Latin jargon, consistent punctuation', () => {
  const every = KINDS.flatMap(all);
  assert.ok(every.length >= 100, `мало текстов: ${every.length}`);
  const problems = [];
  for (const text of every) {
    if (/(^|[^а-яё])(ты|тебе|тебя|твой|твоя|твоё|твои)(?=[^а-яё]|$)/i.test(text)) problems.push(`на «ты»: ${text}`);
    if (/\.\.\./.test(text)) problems.push(`три точки вместо «…»: ${text}`);
    if (/["']/.test(text)) problems.push(`прямые кавычки вместо «»: ${text}`);
    if (/!/.test(text)) problems.push(`восклицательный знак: ${text}`);
    const latin = text.replace(/A-0XX|A-\d{3}|sample-request\.txt|\b1С\b/g, '').match(/[A-Za-z]{2,}/g);
    if (latin) problems.push(`латиница (${latin.join(', ')}): ${text}`);
    if (!/^[А-ЯЁA-Z0-9«←+✓]/.test(text)) problems.push(`начинается не с заглавной: ${text}`);
  }
  for (const text of all('Кнопки')) {
    if (/[.:;]$/.test(text)) problems.push(`кнопка с точкой в конце: ${text}`);
    if (text.split(/\s+/).length > 4) problems.push(`длинная кнопка: ${text}`);
  }
  for (const text of all('Ошибки')) if (!/[.…]$/.test(text)) problems.push(`ошибка без точки в конце: ${text}`);
  assert.deepEqual(problems, []);
});

test('#35 errors tell what to do and empty states offer a next step', () => {
  const problems = [];
  for (const id of screens) {
    const body = section(id) ?? '';
    const errors = texts(body, 'Ошибки');
    if (!errors.some(text => /(Выберите|Опишите|Введите|Объясните|Повторите|Проверьте|Измените|Обновите|Попробуйте|Нажмите|Выберите|Вернитесь|Откройте|Подождите|Укажите|Переключите)/i.test(text))) {
      problems.push(`${id}: ни одна ошибка не говорит, что делать`);
    }
    const empty = texts(body, 'Пустое состояние').join(' ');
    if (!/(Нажмите|Подайте|Выберите|Измените|Откройте|Появ|Переключите|Подать|Сбросить|Добавьте|Вернитесь)/i.test(empty)) problems.push(`${id}: пустое состояние без следующего шага`);
  }
  assert.deepEqual(problems, []);
});
