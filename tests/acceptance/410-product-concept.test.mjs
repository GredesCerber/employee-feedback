import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const documentUrl = new URL('../../contracts/concept/product-concept.md', import.meta.url);
const document = readFileSync(documentUrl, 'utf8');

test('#410 unified concept has problem, value, users, scenarios, MVP scope, assumptions and usefulness checks', () => {
  for (const heading of ['Проблема', 'Ценность', 'Пользователи', 'Сценарии', 'Состав MVP и отклонённое', 'Допущения', 'Проверка полезности']) {
    assert.ok(document.includes(`## `) && new RegExp(`^## \\d+\\. ${heading}$`, 'm').test(document), heading);
  }
  for (const metric of ['М1', 'М2', 'М3', 'М4']) assert.ok(document.includes(`**${metric}.`), metric);
});

test('#410 assumptions section lists the affected concept for every assumption row', () => {
  const assumptions = document.split('## 6. Допущения')[1].split('## 7.')[0];
  const rows = assumptions.split('\n').filter(line => line.startsWith('|') && !line.includes('---'));
  assert.ok(rows.length >= 4);
  for (const row of rows.slice(1)) assert.equal(row.split('|').filter(cell => cell.trim()).length, 2, row);
});

test('#410 concept defers to the captain PRD and every link resolves', () => {
  assert.ok(document.includes('product-prd.md'));
  for (const [, href] of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    assert.ok(!/^https?:/.test(href));
    assert.ok(existsSync(new URL(href.split('#')[0], documentUrl)), href);
  }
});
