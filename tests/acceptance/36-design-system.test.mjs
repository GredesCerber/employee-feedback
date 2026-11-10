import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const docUrl = new URL('../../design/system/design-system.md', import.meta.url);
const read = () => readFileSync(docUrl, 'utf8');

test('36 design system specifies foundations and reusable components', () => {
  const doc = read();
  for (const section of ['Палитра', 'Типографика', 'Отступы', 'Компоненты', 'Сборка экранов', 'Состояния', 'Референсы']) assert.ok(doc.includes(section), section);
  for (const component of ['shell', 'form', 'card', 'status', 'filter', 'table', 'timeline', 'result', 'metrics', 'feedback']) assert.ok(doc.includes(`### ${component} —`), component);
  assert.match(doc, /360/); assert.match(doc, /44 px/);
  assert.match(doc, /кириллиц/); assert.match(doc, /фокус/i);
  assert.match(doc, /Имитация/);
  for (const state of ['загрузка', 'пусто', 'ошибка', '429', 'фокус', 'disabled']) assert.ok(doc.includes(state), state);
});

test('36 every screen/state from the demo map has a component recipe and valid local references', () => {
  const doc = read();
  const map = readFileSync(new URL('../../design/flows/screen-map.md', import.meta.url), 'utf8');
  const ids = [...map.matchAll(/^  (\w+)\["/gm)].map(match => match[1]);
  assert.ok(ids.length >= 9);
  for (const id of ids) {
    const row = doc.split('\n').find(line => line.startsWith(`| \`${id}\` |`));
    assert.ok(row, `screen ${id} lacks a recipe`);
    assert.ok(row.includes('`shell`'), `screen ${id} lacks shared shell`);
    const cells = row.split('|');
    const components = [...cells[3].matchAll(/`([a-z]+)`/g)].map(match => match[1]);
    assert.ok(components.length >= 2, `screen ${id} lacks components`);
    for (const name of components) assert.ok(doc.includes(`### ${name} —`), `${id}: unknown ${name}`);
  }
  for (const path of ['/my', '/submit', '/my/:complaintId', '/queue', '/queue/:complaintId', '/summary', '/about']) assert.ok(doc.includes('`' + path + '`'), path);
  for (const match of doc.matchAll(/\]\((\.{1,2}\/[^)#]+)(?:#[^)]*)?\)/g)) assert.ok(existsSync(new URL(match[1], docUrl)), match[1]);
});

function luminance(hex) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
test('36 documented text/background pairs meet 4.5 contrast in both themes', () => {
  const doc = read();
  const colors = new Map([...doc.matchAll(/^\| `([\w-]+)` \| `(#[0-9a-f]{6})` \| `(#[0-9a-f]{6})` \|/gm)].map(match => [match[1], match.slice(2, 4)]));
  const pairs = [['text', 'surface'], ['text', 'bg'], ['muted', 'surface'], ['on-primary', 'primary']];
  for (const status of ['new', 'in_review', 'in_progress', 'awaiting_clarification', 'implemented', 'rejected', 'closed']) pairs.push([status + '-fg', status + '-bg']);
  for (const [fg, bg] of pairs) {
    assert.ok(colors.has(fg) && colors.has(bg), `missing ${fg}/${bg}`);
    for (let theme = 0; theme < 2; theme++) {
      const values = [luminance(colors.get(fg)[theme]), luminance(colors.get(bg)[theme])].sort((a, b) => b - a);
      assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `low contrast: ${fg}/${bg} theme ${theme}`);
    }
  }
});
