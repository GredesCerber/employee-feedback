import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const documentUrl = new URL('../../contracts/concept/tech-concept.md', import.meta.url);
const document = readFileSync(documentUrl, 'utf8');
const paragraphs = document.split(/\r?\n\s*\r?\n/);
const implemented = keyword => paragraphs.find(paragraph => paragraph.startsWith('Реализовано:') && paragraph.includes(keyword));

test('#174 persistence is implemented with source evidence and explicit opt-in boundaries', () => {
  const paragraph = implemented('PERSIST_FILE');
  assert.ok(paragraph, 'file persistence must be described as implemented');
  assert.ok(paragraph.includes('../../api/src/persistence.ts'));
  assert.match(paragraph, /атомарн/);
  const limits = document.split('## Ограничения MVP')[1].split('## Открытые вопросы')[0];
  assert.match(limits, /PERSIST_FILE/);
  assert.match(limits, /без.*PERSIST_FILE|Без.*PERSIST_FILE/);
  assert.match(limits, /один процесс|одного процесса/);
});

test('#174 write-rate limits and 429 response cite the implementation and contract', () => {
  const paragraph = implemented('Retry-After');
  assert.ok(paragraph, 'rate limiting must be described as implemented');
  for (const text of ['POST', 'PATCH', '429', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_S', '../../api/src/rate-limit.ts', '../api.yaml']) assert.ok(paragraph.includes(text), text);
});

test('#174 one-command launcher is implemented and obsolete roadmap promises are removed', () => {
  const paragraph = implemented('node infra/run-demo.mjs');
  assert.ok(paragraph, 'one-command launcher must be described as implemented');
  assert.match(paragraph, /без Docker/);
  assert.ok(paragraph.includes('../../infra/README.md'));
  assert.ok(paragraph.includes('../../infra/run-demo.mjs'));
  assert.doesNotMatch(document, /План: объединить локальный запуск в одну команду/);
  assert.doesNotMatch(document, /План: лимиты запросов, постоянное хранение/);
  assert.match(document.split('## Развитие')[1], /PostgreSQL|БД/);
  for (const [, href] of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) assert.ok(existsSync(new URL(href.split('#')[0], documentUrl)), href);
});
