import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const file = new URL('../../design/demo/pitch.md', import.meta.url);
const document = () => readFileSync(file, 'utf8');
const seconds = (minute, second) => Number(minute) * 60 + Number(second);

test('#38 текст слайдов, все шаги демо и непрерывная разметка на три минуты', () => {
  const text = document();
  const slides = text.split(/^## (?=Слайд \d+\.)/m).slice(1).map((part) => part.split(/^## /m)[0]);
  assert.ok(slides.length >= 4 && slides.length <= 8, 'Нужен короткий набор слайдов');
  let end = 0;
  const steps = new Set();
  const speech = [];
  for (const [index, slide] of slides.entries()) {
    const heading = slide.match(/^Слайд (\d+)\. (\d{2}):(\d{2})–(\d{2}):(\d{2})/);
    assert.ok(heading, `Слайд ${index + 1}: нужен интервал ММ:СС–ММ:СС`);
    assert.equal(Number(heading[1]), index + 1);
    assert.equal(seconds(heading[2], heading[3]), end, 'Интервалы идут без пропусков и наложений');
    end = seconds(heading[4], heading[5]);
    assert.ok(end > seconds(heading[2], heading[3]));
    assert.match(slide, /\*\*На слайде:\*\*/);
    assert.match(slide, /\*\*Показываем:\*\* .+/);
    const spoken = [...slide.matchAll(/^> (.+)$/gm)].map((match) => match[1]).join(' ');
    assert.ok(spoken.length > 100, `Слайд ${index + 1}: нужен текст выступления`);
    speech.push(spoken);
    const marker = slide.match(/\*\*Шаги демо:\*\* ([\d, ]+)/);
    if (marker) for (const step of marker[1].match(/\d+/g)) steps.add(Number(step));
  }
  assert.equal(end, 180);
  assert.deepEqual([...steps].sort(), [1, 2, 3, 4, 5, 6]);
  const words = speech.join(' ').match(/[\p{L}\p{N}]+(?:[-–][\p{L}\p{N}]+)*/gu).length;
  assert.ok(words >= 300 && words <= 360, `${words} слов: нужно 300–360 с запасом на действия`);
  assert.match(text, /темп/i);
  assert.match(text, /репетиц/i);
});

test('#38 есть явные ответы на три вопроса ТЗ и честные ограничения', () => {
  const text = document();
  for (const question of ['Какую бизнес-задачу решает продукт и какую ценность он создаёт?', 'Как предложенное решение работает на практике?', 'Как продукт можно развивать и интегрировать в информационную среду ГК «Модус Трейд»?']) {
    assert.ok(text.includes(question), question);
    const line = text.split('\n').find((line) => line.includes(question));
    assert.ok(line.split('|').filter((cell) => cell.trim()).at(-1).trim().length > 70, 'Ответ должен быть явным, не только номер слайда');
  }
  const spoken = [...text.matchAll(/^> (.+)$/gm)].map((match) => match[1]).join(' ');
  for (const pattern of [/синтетическ/i, /имитир|имитац/i, /пилот/i, /1С/, /Битрикс24/, /отказ/i, /просроч/i]) assert.match(spoken, pattern);
  for (const [, relative] of text.matchAll(/\]\((\.\.\/[^)#]+)(?:#[^)]*)?\)/g)) assert.ok(existsSync(new URL(relative, file)), `Нет источника ${relative}`);
});
