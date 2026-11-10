// #109 Чек-лист ручной проверки перед защитой и план Б. Сверяется с разбором ТЗ, seed и реальными файлами/скриптами.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, 'utf8');
const doc = read('design/demo/smoke-checklist.md');
const seed = JSON.parse(read('api/data/seed.json'));

function section(title) {
  const lines = doc.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${title}`).test(line));
  assert.notEqual(start, -1, `нет раздела «${title}»`);
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

function tableRows(text) {
  return text.split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && !/^\|\s*-/.test(line.trim()))
    .slice(1)
    .map((line) => line.trim().split('|').slice(1, -1).map((cell) => cell.trim()));
}

test('#109 чек-лист: 6 шагов демо с ожидаемым результатом и данными из датасета', () => {
  const rows = tableRows(section('Чек-лист'));
  assert.equal(rows.length, 6, 'ожидается ровно 6 шагов');
  rows.forEach((cells, index) => {
    assert.equal(cells[0], String(index + 1), `шаг ${index + 1}: номер`);
    assert.ok(cells.length >= 4 && cells.every(Boolean), `шаг ${index + 1}: нужны действие, данные и ожидаемый результат`);
  });
  const numbers = new Set(seed.map((row) => row.number));
  const categories = new Set(seed.map((row) => row.category));
  const text = rows.map((cells) => cells.join(' ')).join('\n');
  const mentioned = [...text.matchAll(/A-\d{3}/g)].map((match) => match[0]);
  assert.ok(mentioned.some((number) => numbers.has(number)), 'нужны номера обращений из seed');
  assert.ok([...categories].some((name) => text.includes(name)), 'нужна категория из seed');
  for (const login of ['employee-1', 'manager-1', 'admin-1']) assert.ok(text.includes(login), `нет логина ${login}`);
  const next = `A-${String(seed.length + 1).padStart(3, '0')}`;
  assert.ok(text.includes(next), `новое обращение должно получить номер ${next}`);
});

test('#109 план Б: 5 сбоев и действие на каждый', () => {
  const rows = tableRows(section('План Б'));
  const failures = ['api не стартует', 'порт занят', 'нет сети', 'веб не грузится', 'данные испорчены'];
  assert.equal(rows.length, failures.length);
  for (const failure of failures) {
    const row = rows.find((cells) => cells[0].toLowerCase().includes(failure));
    assert.ok(row, `нет сбоя «${failure}»`);
    assert.ok(row.slice(1).every(Boolean), `«${failure}»: нет признака или действия`);
    assert.match(row.join(' '), /`(node|npm|docker) [^`]+`/, `«${failure}»: в действии нужна команда`);
  }
  assert.match(section('План Б'), /--seed-reset/, 'нужна команда сброса демо');
});

test('#109 «Что говорим честно» соответствует docs/tz-analysis.md', () => {
  const analysis = tableRows(read('docs/tz-analysis.md').split('## 2. Требования')[1].split(/\n## /)[0]);
  const statusFor = (inDemo) => (/имитац/i.test(inDemo) ? 'имитация' : /^нет/i.test(inDemo) ? 'план' : 'реализовано');
  const rows = tableRows(section('Что говорим честно'));
  for (const cells of rows) assert.ok(['реализовано', 'имитация', 'план'].includes(cells[1]), `неизвестный статус «${cells[1]}»`);
  for (const [id, , , inDemo] of analysis) {
    const row = rows.find((cells) => cells[0].startsWith(id + ' ') || cells[0] === id);
    assert.ok(row, `нет строки для ${id}`);
    assert.equal(row[1], statusFor(inDemo), `${id}: в разборе ТЗ «${inDemo}»`);
  }
  for (const word of ['имитация', 'план']) assert.ok(rows.some((cells) => cells[1] === word), `нет ни одной функции «${word}»`);
});

test('#109 каждая команда в документе ссылается на существующий файл или npm-скрипт', () => {
  const commands = [
    ...[...doc.matchAll(/```(?:sh|bash|powershell)?\r?\n([\s\S]*?)```/g)].flatMap((match) => match[1].split(/\r?\n/)),
    ...[...doc.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]),
  ].map((line) => line.trim()).filter((line) => /^(node|npm|docker) /.test(line));
  assert.ok(commands.length >= 5, 'слишком мало команд');
  for (const command of commands) {
    const words = command.split(/\s+/);
    if (words[0] === 'node') {
      const file = words.find((word, index) => index > 0 && !word.startsWith('-'));
      assert.ok(file && existsSync(`${root}${file}`), `${command}: нет файла ${file}`);
    } else if (words[0] === 'npm') {
      const prefixIndex = words.indexOf('--prefix');
      const dir = prefixIndex === -1 ? '.' : words[prefixIndex + 1];
      const pkgPath = `${root}${dir}/package.json`;
      assert.ok(existsSync(pkgPath), `${command}: нет ${dir}/package.json`);
      const runIndex = words.indexOf('run');
      if (runIndex !== -1) {
        const script = words[runIndex + 1];
        assert.ok(JSON.parse(readFileSync(pkgPath, 'utf8')).scripts?.[script], `${command}: нет npm-скрипта ${script}`);
      } else {
        assert.ok(['ci', 'install'].includes(words[prefixIndex === -1 ? 1 : 3]), `${command}: ожидается run, ci или install`);
      }
    } else {
      assert.ok(existsSync(`${root}docker-compose.yml`), `${command}: нет docker-compose.yml`);
    }
  }
});
