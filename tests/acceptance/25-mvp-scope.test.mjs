import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const file = new URL('contracts/concept/mvp-scope.md', root);
const text = () => readFileSync(file, 'utf8');

/** Тело раздела второго уровня: от заголовка до следующего `## `. */
const section = (title) => {
  const match = text().match(new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  assert.ok(match, `Нет раздела «${title}»`);
  return match[1];
};

/** Строки всех таблиц раздела как объекты «заголовок столбца → ячейка». */
const rows = (body) => {
  const result = [];
  let header = null;
  for (const line of body.split('\n')) {
    if (!line.startsWith('|')) { header = null; continue; }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!header) { header = cells; continue; }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    result.push(Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])));
  }
  return result;
};

const ideaDirs = ['design/ideas', 'web/concept/ideas', 'api/concept/ideas', 'docs/research/ideas'];
const ideaFiles = () => ideaDirs.flatMap((dir) => readdirSync(new URL(`${dir}/`, root))
  .filter((name) => name.endsWith('.md') && !/position|discussion|TEMPLATE/.test(name))
  .map((name) => `${dir}/${name}`));

test('#25 три списка: MVP, развитие, отклонено; у каждой идеи есть причина', () => {
  for (const [title, minimum] of [['MVP', 10], ['Развитие', 8], ['Отклонено', 4]]) {
    const list = rows(section(title));
    assert.ok(list.length >= minimum, `«${title}»: строк ${list.length}, нужно не меньше ${minimum}`);
    for (const row of list) {
      assert.ok(row['Идея'] && row['Идея'].length >= 10, `«${title}»: пустая идея`);
      assert.ok(row['Причина'] && row['Причина'].length >= 30, `«${title}»: нет причины у «${row['Идея']}»`);
      assert.match(row['Связь с ТЗ'] ?? '', /п\. \d|R\d|—/, `«${title}»: нет связи с ТЗ у «${row['Идея']}»`);
    }
  }
});

test('#25 учтены все идеи участников, позиции T7, T8, T14, T18 и обсуждения T21–T24', () => {
  const content = text();
  for (const path of ideaFiles()) {
    assert.ok(content.includes(`../../${path}`), `Идея не разобрана: ${path}`);
  }
  for (const path of [
    'design/ideas/ami-m1nzyi-position.md', 'web/concept/ideas/punyzxc-position.md',
    'api/concept/ideas/gredescerber-position.md', 'docs/research/ideas/wohorchik-position.md',
    'design/ideas/discussion-ami-m1nzyi.md', 'web/concept/ideas/discussion-punyzxc.md',
    'api/concept/ideas/discussion-gredescerber.md', 'docs/research/ideas/discussion-wohorchik.md',
    'docs/manifest.md',
  ]) {
    assert.ok(content.includes(`../../${path}`), `Нет ссылки на источник: ${path}`);
  }
  for (const [, relative] of content.matchAll(/\]\((\.\.?\/[^)#]+)(?:#[^)]*)?\)/g)) {
    assert.ok(existsSync(new URL(relative, file)), `Нет файла ${relative}`);
  }
  assert.match(content, /правил[оа] отклонения/i);
});

test('#25 каждый спорный вопрос обсуждений получил итог', () => {
  const disputes = rows(section('Решения по спорным вопросам'));
  assert.ok(disputes.length >= 12, `Спорных вопросов ${disputes.length}, нужно не меньше 12`);
  for (const row of disputes) {
    assert.ok(row['Вопрос'].length >= 10);
    assert.ok(row['Итог'].length >= 20, `Нет итога: ${row['Вопрос']}`);
  }
});

test('#25 граница MVP покрывает все must-требования R1–R5 и R9–R12', () => {
  const coverage = rows(section('Покрытие must-требований'));
  const analysis = readFileSync(new URL('docs/tz-analysis.md', root), 'utf8');
  for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R9', 'R10', 'R11', 'R12']) {
    assert.match(analysis, new RegExp(`\\| ${id} \\|[^\\n]*\\| must \\|`), `${id} не must в разборе ТЗ`);
    const row = coverage.find((entry) => entry['Требование'].startsWith(`${id} `) || entry['Требование'] === id);
    assert.ok(row, `Нет строки покрытия для ${id}`);
    assert.match(row['Пункт ТЗ'], /п\. \d/, `${id}: нет пункта ТЗ`);
    assert.ok(row['Чем покрыто в MVP'].length >= 30, `${id}: не сказано, чем покрыто`);
    assert.match(row['Покрыто'], /^да/i, `${id}: не покрыто`);
  }
});
