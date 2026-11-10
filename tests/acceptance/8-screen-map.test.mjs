import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const document = () => read('design/flows/screen-map.md');
const diagram = () => {
  const blocks = [...document().matchAll(/```mermaid\r?\n([\s\S]*?)```/g)];
  assert.equal(blocks.length, 1, 'Карта должна иметь одну общую диаграмму переходов');
  assert.match(blocks[0][1], /^flowchart (LR|TD|TB)/);
  return blocks[0][1];
};
const nodes = () => new Map([...diagram().matchAll(/^\s*(\w+)\["([^"]+)"\]/gm)].map((match) => [match[1], match[2]]));
const edges = () => [...diagram().matchAll(/^\s*(\w+)\s*-->\s*\|[^|]+\|\s*(\w+)\s*$/gm)].map((match) => [match[1], match[2]]);

test('#8 все шесть шагов демо связаны с существующими экранами карты', () => {
  const text = document();
  const screens = nodes();
  const connections = edges();
  assert.ok(screens.size >= 5, 'Нужны форма, мои обращения, карточка, очередь, сводка');
  assert.ok(connections.length >= screens.size - 1, 'Нужны переходы, а не отдельные экраны');
  for (const [from, to] of connections) {
    assert.ok(screens.has(from), `Не объявлен исходный экран ${from}`);
    assert.ok(screens.has(to), `Не объявлен конечный экран ${to}`);
  }
  const covered = new Set();
  for (const match of text.matchAll(/^\| ([1-6]) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)) {
    covered.add(Number(match[1]));
    const ids = [...match[2].matchAll(/`(\w+)`/g)].map((item) => item[1]);
    assert.ok(ids.length > 0, `Шаг ${match[1]} должен ссылаться на узлы диаграммы`);
    for (const id of ids) assert.ok(screens.has(id), `Шаг ${match[1]} ссылается на отсутствующий экран ${id}`);
    assert.ok(match[3].trim().length > 25, `Шаг ${match[1]}: нужно действие пользователя`);
    assert.ok(match[4].trim().length > 25, `Шаг ${match[1]}: нужен наблюдаемый результат`);
  }
  assert.deepEqual([...covered].sort(), [1, 2, 3, 4, 5, 6]);
  // Проверяем связность без фиксирования внутренней компоновки схемы.
  const reached = new Set([screens.keys().next().value]);
  for (let pass = 0; pass < screens.size; pass++) {
    for (const [from, to] of connections) if (reached.has(from)) reached.add(to);
  }
  assert.deepEqual([...reached].sort(), [...screens.keys()].sort(), 'Все экраны достижимы из входного узла');
  for (const term of ['уточнен', 'отказ', 'ответствен', 'просроч', 'среднее время первого ответа']) {
    assert.ok(text.toLowerCase().includes(term), `Не показана часть сценария: ${term}`);
  }
});

test('#8 у каждого экрана указаны роли; маршруты и ограничения согласованы с приложением', () => {
  const text = document();
  const app = read('web/src/App.tsx');
  for (const [id, label] of nodes()) {
    assert.match(label, /Роли?: (employee|manager|admin)(?:, (employee|manager|admin))*(?:<br\/>|$)/, `${id}: нет роли`);
  }
  const routes = [...app.matchAll(/<Route path="([^"]+)" element={<RoleRoute role="([^"]+)"/g)];
  for (const [, path, role] of routes) {
    const matching = [...nodes().values()].filter((label) => label.includes(`<br/>${path}<br/>`));
    assert.ok(matching.length > 0, `В карте отсутствует маршрут ${path}`);
    for (const label of matching) assert.ok(label.includes(`Роль: ${role}`), `Неверная роль маршрута ${path}`);
  }
  assert.match(text, /имитация входа/i);
  assert.match(text, /только свои/i);
  assert.match(text, /администратор[^\n]+очеред[^\n]+недоступ/i);
  for (const match of text.matchAll(/\]\((\.\.\/[^)#]+)(?:#[^)]*)?\)/g)) {
    assert.ok(existsSync(new URL(match[1], new URL('../../design/flows/screen-map.md', import.meta.url))), `Не найдена ссылка ${match[1]}`);
  }
});
