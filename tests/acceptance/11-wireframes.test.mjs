import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = join(root, 'web/concept/wireframes');
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const map = read(join(root, 'design/flows/screen-map.md'));
const mermaid = map.match(/```mermaid\n([\s\S]*?)```/)[1];

const nodes = new Map();
for (const m of mermaid.matchAll(/^\s*(\w+)\["([^"]+)"\]/gm)) {
  const route = m[2].split('<br/>').find(part => part.startsWith('/'));
  nodes.set(m[1], { route });
}
const edges = [...mermaid.matchAll(/^\s*(\w+)\s*-->\|([^|]+)\|\s*(\w+)/gm)].map(m => ({ from: m[1], label: m[2].trim(), to: m[3] }));
const key = edge => `${edge.from} --${edge.label}--> ${edge.to}`;

/** Переходы макета: строки «- Подпись → `id`» в разделе «## Переходы». */
function wireframeEdges(id, text) {
  const section = text.split(/^## Переходы\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  return [...section.matchAll(/^- (.+?) → `(\w+)`\s*$/gm)].map(m => ({ from: id, label: m[1].trim(), to: m[2] }));
}

test('#11 screen map has the expected demo screens and transitions', () => {
  for (const id of ['submit', 'registered', 'author', 'mine', 'queue', 'handling', 'summary']) assert.ok(nodes.has(id), id);
  assert.ok(edges.length >= 20);
});

test('#11 every screen of demo steps 1-6 has a wireframe in web/concept/wireframes/ without logic code', () => {
  const steps = map.split('## Шесть шагов для ведущего демо')[1].split('\n## ')[0];
  const demoScreens = new Set([...steps.matchAll(/`(\w+)`/g)].map(m => m[1]).filter(id => nodes.has(id)));
  assert.deepEqual([...demoScreens].sort(), ['author', 'handling', 'queue', 'registered', 'submit', 'summary']);
  // Макет нужен каждому экрану шагов 1-6 и всем остальным узлам карты (шапка, «Мои обращения», «О прототипе»).
  for (const id of new Set([...demoScreens, ...nodes.keys()])) {
    const file = join(dir, `${id}.md`);
    assert.ok(existsSync(file), `нет макета ${id}.md`);
    const text = read(file);
    assert.match(text, /```text\n[\s\S]*?┌[\s\S]*?```/, `${id}: нужна схема экрана в блоке text`);
    if (nodes.get(id).route) assert.ok(text.includes(nodes.get(id).route), `${id}: укажите маршрут ${nodes.get(id).route}`);
  }
  const code = readdirSync(dir, { recursive: true }).filter(name => /\.(?:[cm]?[jt]sx?|css)$/.test(String(name)));
  assert.deepEqual(code, [], 'в макетах не должно быть кода логики');
  const index = read(join(dir, 'README.md'));
  for (const id of nodes.keys()) assert.ok(index.includes(`(${id}.md)`), `README: нет ссылки на ${id}.md`);
});

test('#11 transitions in wireframes match the screen map exactly', () => {
  const expected = edges.map(key).sort();
  const actual = [...nodes.keys()].flatMap(id => wireframeEdges(id, read(join(dir, `${id}.md`)))).map(key).sort();
  const missing = expected.filter(edge => !actual.includes(edge));
  const extra = actual.filter(edge => !expected.includes(edge));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] });
});
