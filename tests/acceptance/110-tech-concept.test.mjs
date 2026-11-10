import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const documentUrl = new URL('../../contracts/concept/tech-concept.md', import.meta.url);
const read = () => readFileSync(documentUrl, 'utf8');

test('#110 technical concept covers architecture, access, integrations, limits and staged development', () => {
  const doc = read();
  for (const heading of ['Компоненты', 'Модель данных', 'Роли и доступ', 'Безопасность и персональные данные',
    'Интеграции 1С УТ и Битрикс24', 'Масштабирование', 'Ограничения MVP', 'Открытые вопросы', 'Развитие']) {
    assert.ok(doc.includes(`## ${heading}`), heading);
  }
  assert.match(doc, /MVP.*пилот.*промышленная версия/);
  const roadmap = doc.split('## Развитие')[1];
  for (const stage of ['MVP', 'Пилот', 'Промышленная версия']) assert.ok(roadmap.includes(stage));
  assert.ok((roadmap.match(/Критерий перехода/g) ?? []).length >= 3);
});

test('#110 source links resolve to files and factual paragraphs cite sources or distinguish plans/simulations', () => {
  const doc = read();
  const links = [...doc.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(links.length >= 10);
  for (const href of links) {
    assert.ok(!/^https?:/.test(href), 'evidence uses repository sources');
    assert.ok(existsSync(new URL(href.split('#')[0], documentUrl)), href);
  }
  for (const paragraph of doc.split(/\r?\n\s*\r?\n/)) {
    if (!paragraph.trim() || paragraph.startsWith('#')) continue;
    assert.ok(/\]\(|План|план|Имитация|имитация/.test(paragraph), paragraph.slice(0, 120));
  }
});

test('#110 reconciles existing access and integration concepts without presenting planned features as implemented', () => {
  const doc = read();
  assert.ok(doc.includes('../../docs/research/integrations.md'));
  assert.ok(doc.includes('../../api/concept/access.md'));
  const questions = doc.split('## Открытые вопросы')[1].split('## Развитие')[0];
  assert.match(questions, /аноним/i);
  assert.match(questions, /уведомлен/i);
  assert.match(questions, /администратор/i);
  assert.match(doc, /X-Demo-User/);
  assert.match(doc, /не.*аутентификац/i);
});
