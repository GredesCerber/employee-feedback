import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const file = new URL('design/demo/jury-qa.md', root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const sections = () => readFileSync(file, 'utf8').split(/^### (?=\d{2}\. )/m).slice(1);
const anchor = (heading) => heading.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

test('#37 ровно 30 вопросов с содержательными ответами и рабочими ссылками на пункты ТЗ', () => {
  const questions = sections();
  assert.equal(questions.length, 30);
  const specification = read('docs/tz.md');
  const anchors = new Set([...specification.matchAll(/^#{1,6} (.+)$/gm)].map((match) => anchor(match[1].trim())));
  for (const [index, question] of questions.entries()) {
    assert.equal(Number(question.slice(0, 2)), index + 1);
    assert.match(question.split('\n')[0], /\?\s*$/);
    const answer = question.match(/\*\*Ответ:\*\*\s*([^\n]+)/);
    assert.ok(answer && answer[1].trim().length >= 100, `Вопрос ${index + 1}: ответ слишком короток`);
    const references = [...question.matchAll(/\[ТЗ п\. ([\d.]+)\]\(\.\.\/\.\.\/docs\/tz\.md#([^)]*)\)/g)];
    assert.ok(references.length > 0, `Вопрос ${index + 1}: нет ссылки на пункт ТЗ`);
    for (const [, number, target] of references) {
      assert.ok(anchors.has(target), `Вопрос ${index + 1}: не существует якорь ${target}`);
      assert.ok(target.startsWith(number.replaceAll('.', '')), `Вопрос ${index + 1}: номер пункта не соответствует якорю`);
    }
  }
  for (const [, relative] of readFileSync(file, 'utf8').matchAll(/\]\((\.\.\/[^)#]+)(?:#[^)]*)?\)/g)) {
    assert.ok(existsSync(new URL(relative, file)), `Нет файла ${relative}`);
  }
});

test('#37 пять главных рисков расположены первыми и названы честные слабые места', () => {
  const questions = sections();
  const dangerous = questions.filter((question) => question.split('\n')[0].includes('[ТОП-5]'));
  assert.equal(dangerous.length, 5);
  assert.deepEqual(dangerous, questions.slice(0, 5));
  for (const question of dangerous) {
    assert.match(question, /\*\*Слабое место:\*\* .{50,}/);
    assert.match(question, /\*\*Следующий шаг:\*\* .{50,}/);
  }
  const combined = dangerous.join('\n');
  for (const risk of [/авторизац|аутентификац/i, /памят|перезапуск/i, /аноним/i, /пилот|полезност/i, /уведомлен/i]) {
    assert.match(combined, risk);
  }
  const text = readFileSync(file, 'utf8');
  assert.match(text, /docs\/manifest\.md/);
  assert.match(text, /синтетическ/i);
  assert.match(text, /имитаци/i);
  assert.match(text, /план/i);
});
