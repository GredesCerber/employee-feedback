// #108 Диаграммы для слайдов: архитектура, статусы, маршрутизация, поток данных.
// Диаграммы сверяются с контрактом и seed, а не с тем, что написано в самих файлах.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, 'utf8');
const files = ['architecture', 'status-lifecycle', 'routing', 'data-flow'];

function mermaid(name) {
  const blocks = [...read(`design/diagrams/${name}.md`).matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
  assert.equal(blocks.length, 1, `${name}.md: ожидается ровно один блок mermaid`);
  return blocks[0];
}

/** Рёбра вида `a --> b` и `a -->|подпись| b`; служебные узлы [*] пропускаются. */
function edges(source) {
  const result = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][\w]*)\s*-->\s*(?:\|[^|]*\|\s*)?([A-Za-z_][\w]*)\s*(?::.*)?$/);
    if (match) result.push([match[1], match[2]]);
  }
  return result;
}

/** Подписи узлов: `id["текст"]` и `id(["текст"])`. */
function labels(source) {
  const result = new Map();
  for (const match of source.matchAll(/([A-Za-z_]\w*)\s*\(?\[\s*"([^"]+)"\s*\]\)?/g)) result.set(match[1], match[2]);
  return result;
}

test('#108 у каждой диаграммы есть mermaid, подпись на русском и два предложения для слайда', () => {
  for (const name of files) {
    assert.ok(existsSync(`${root}design/diagrams/${name}.md`), `нет файла design/diagrams/${name}.md`);
    const text = read(`design/diagrams/${name}.md`);
    mermaid(name);
    const caption = text.match(/^\*\*Подпись:\*\*\s*(.+)$/m);
    assert.ok(caption && /[а-яё]{3,}/i.test(caption[1]), `${name}.md: нужна строка «**Подпись:** …» на русском`);
    const slide = text.match(/^\*\*Что сказать на слайде:\*\*\s*(.+)$/m);
    assert.ok(slide, `${name}.md: нужна строка «**Что сказать на слайде:** …»`);
    const sentences = slide[1].split(/(?<=[.!?])\s+/).filter((part) => /[а-яё]/i.test(part));
    assert.equal(sentences.length, 2, `${name}.md: в «Что сказать на слайде» должно быть ровно 2 предложения`);
  }
});

test('#108 архитектура: веб, API, хранилище и подписанные имитации 1С и Битрикс24', () => {
  const source = mermaid('architecture');
  for (const word of ['nginx', 'Fastify', 'seed.json', '1С', 'Битрикс24']) {
    assert.ok(source.includes(word), `architecture.md: в схеме нет «${word}»`);
  }
  const external = source.split(/\r?\n/).filter((line) => /1С|Битрикс24/.test(line) && /\[/.test(line));
  assert.ok(external.length >= 2, 'architecture.md: 1С и Битрикс24 должны быть отдельными узлами');
  for (const line of external) {
    assert.match(line, /план|имитация/i, `architecture.md: внешний узел без пометки «план/имитация»: ${line.trim()}`);
  }
  // Сверка с реальным составом: сервисы compose и файлы infra/.
  const compose = read('docker-compose.yml');
  assert.match(compose, /^\s{2}api:/m);
  assert.match(compose, /^\s{2}web:/m);
  assert.match(read('infra/nginx.conf'), /location \/api\//);
  assert.ok(source.includes('/api/'), 'architecture.md: не показан прокси /api/ из infra/nginx.conf');
});

test('#108 статусы: переходы диаграммы совпадают с x-status-transitions контракта', () => {
  const contract = JSON.parse(read('contracts/api.yaml'))['x-status-transitions'];
  const expected = Object.entries(contract).flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`)).sort();
  const actual = edges(mermaid('status-lifecycle')).map(([from, to]) => `${from}>${to}`).sort();
  assert.ok(expected.length > 0);
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, actual.length, 'status-lifecycle.md: повторяющиеся переходы');
});

test('#108 маршрутизация: категория → ответственный → запасная очередь, как в api/src/seed.ts', () => {
  const rows = JSON.parse(read('api/data/seed.json'));
  // seed.ts берёт ответственного по первой строке категории.
  const expected = new Map();
  for (const row of rows) if (!expected.has(row.category)) expected.set(row.category, row.assignee);

  const source = mermaid('routing');
  const names = labels(source);
  const actual = new Map();
  for (const [from, to] of edges(source)) {
    if (from.startsWith('c_') && /^m\d+$/.test(to)) actual.set(names.get(from), names.get(to));
  }
  assert.deepEqual([...actual.entries()].sort(), [...expected.entries()].sort());

  const seed = read('api/src/seed.ts');
  assert.match(seed, /no_rule_demo/);
  assert.ok(source.includes('Категория без ответственного (демо)'), 'routing.md: нет демо-категории без правила');
  for (const word of ['unassigned', 'no_rule', 'category_rule', 'manual_assignment']) {
    assert.ok(source.includes(word), `routing.md: в схеме нет «${word}»`);
    assert.ok(read('api/src/complaints.ts').includes(word), `в api/src/complaints.ts нет «${word}»`);
  }
});

test('#108 поток данных: от подачи до итога и повторяющихся тем в сводке', () => {
  const source = mermaid('data-flow');
  for (const word of ['POST /complaints', 'decision', 'GET /summary', 'Повторяющиеся темы', 'Автор видит итог']) {
    assert.ok(source.includes(word), `data-flow.md: в схеме нет «${word}»`);
  }
  const paths = Object.keys(JSON.parse(read('contracts/api.yaml')).paths);
  for (const path of ['/complaints', '/complaints/{complaintId}/status', '/complaints/{complaintId}/comments',
    '/complaints/{complaintId}/decision', '/summary']) {
    assert.ok(paths.includes(path), `в контракте нет пути ${path}`);
  }
  assert.match(read('api/src/analytics.ts'), /recurringTopics/);
});
