// #107 Набор SVG-иконок статусов, типов и ролей. Список статусов, типов и ролей берётся из контракта.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = `${root}design/assets/icons/`;
const read = (path) => readFileSync(path, 'utf8');
const schemas = JSON.parse(read(`${root}contracts/api.yaml`)).components.schemas;

function enumOf(schemaName) {
  const values = schemas[schemaName]?.enum;
  assert.ok(Array.isArray(values), `в контракте нет enum ${schemaName}`);
  return values;
}

const expected = [
  ...enumOf('Status').map((value) => `status-${value}`),
  ...enumOf('ComplaintType').map((value) => `type-${value}`),
  ...enumOf('Role').map((value) => `role-${value}`),
  'overdue', 'simulated', 'anonymous', 'rollback',
];
const svgFiles = () => readdirSync(dir).filter((name) => name.endsWith('.svg'));

test('#107 есть SVG для 7 статусов, 3 типов, 3 ролей и 4 особых меток', () => {
  assert.equal(expected.length, 7 + 3 + 3 + 4);
  for (const name of expected) assert.ok(existsSync(`${dir}${name}.svg`), `нет ${name}.svg`);
});

/** Минимальная проверка корректности XML: парность тегов и экранирование. */
function assertWellFormed(source, file) {
  const body = source.replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(body), `${file}: неэкранированный &`);
  const stack = [];
  for (const match of body.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*("[^"]*"|'[^']*'))*)\s*(\/?)>/g)) {
    const [, closing, tag, , , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), tag, `${file}: непарный </${tag}>`);
    else stack.push(tag);
  }
  assert.deepEqual(stack, [], `${file}: незакрытые теги ${stack.join(', ')}`);
  const tags = body.match(/<[^>]*>/g) ?? [];
  const parsed = [...body.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*("[^"]*"|'[^']*'))*)\s*(\/?)>/g)];
  assert.equal(parsed.length, tags.length, `${file}: есть тег с некорректным синтаксисом`);
  assert.match(body.trim(), /^<svg[\s>][\s\S]*<\/svg>$/, `${file}: корневой элемент должен быть <svg>`);
}

test('#107 каждый SVG — валидный XML с viewBox, без внешних ссылок и скриптов, цвет через currentColor', () => {
  const files = svgFiles();
  assert.ok(files.length >= expected.length);
  for (const file of files) {
    const source = read(`${dir}${file}`);
    assertWellFormed(source, file);
    assert.match(source, /<svg[^>]*\sviewBox="0 0 \d+ \d+"/, `${file}: нет viewBox`);
    assert.match(source, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${file}: нет xmlns`);
    assert.ok(!/<script|\son\w+\s*=|<foreignObject|<image|<use|href\s*=|url\(/i.test(source), `${file}: скрипт, обработчик или внешняя ссылка`);
    assert.ok(!/xlink:/i.test(source), `${file}: xlink запрещён`);
    assert.match(source, /currentColor/, `${file}: цвет должен задаваться currentColor`);
    for (const match of source.matchAll(/(?:fill|stroke|color|stop-color)\s*=\s*"([^"]+)"/g)) {
      assert.ok(['none', 'currentColor'].includes(match[1]), `${file}: жёсткий цвет ${match[1]}`);
    }
    assert.match(source, /<title[^>]*>[^<]+<\/title>/, `${file}: нет <title> для доступности`);
  }
});

test('#107 README: таблица «иконка → смысл → где использовать» и правила размеров', () => {
  const readme = read(`${dir}README.md`);
  assert.match(readme, /\|\s*Иконка\s*\|\s*Смысл\s*\|\s*Где использовать\s*\|/);
  for (const file of svgFiles()) {
    const row = readme.split(/\r?\n/).find((line) => line.startsWith('|') && line.includes(`\`${file}\``));
    assert.ok(row, `README: нет строки для ${file}`);
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 3, `README: в строке ${file} должно быть 3 колонки`);
    assert.ok(cells.every(Boolean), `README: пустая ячейка в строке ${file}`);
  }
  assert.match(readme, /^##\s+Размеры/m, 'README: нет раздела «Размеры»');
  assert.match(readme, /16/);
  assert.match(readme, /24/);
});

test('#107 preview.html показывает все иконки в светлой и тёмной теме', () => {
  const html = read(`${dir}preview.html`);
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /class="light"/);
  assert.match(html, /class="dark"/);
  assert.ok(!/<script/i.test(html), 'preview.html: без скриптов, открывается с диска');
  for (const file of svgFiles()) {
    const svg = read(`${dir}${file}`).trim();
    const count = html.split(svg).length - 1;
    assert.equal(count, 2, `preview.html: ${file} должен быть в обеих темах и совпадать с файлом (перезапустите build-preview.mjs)`);
  }
});
