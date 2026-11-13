import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const documentUrl = new URL('../../contracts/concept/tech-concept.md', import.meta.url);
const document = readFileSync(documentUrl, 'utf8');
const section = (title, next) => document.split(`## ${title}`)[1].split(`## ${next}`)[0];

test('#408 scaling section describes single process, in-memory state, pool size, full scans and no load tests', () => {
  const scaling = section('Масштабирование', 'Ограничения MVP');
  assert.match(scaling, /одного процесса|один процесс/);
  assert.match(scaling, /кэш/);
  assert.match(scaling, /лимит/);
  assert.match(scaling, /max: 3|три соединения|3 соединения/);
  assert.match(scaling, /перебира/);
  assert.match(scaling, /Нагрузочных испытаний не проводилось/);
  assert.match(scaling, /Render/);
  assert.match(scaling, /путь|План:/);
});

test('#408 security section explains the TLS certificate trade-off and the production requirement', () => {
  const security = section('Безопасность и персональные данные', 'Интеграции 1С УТ и Битрикс24');
  assert.match(security, /rejectUnauthorized: false/);
  assert.match(security, /осознанный компромисс демо/);
  assert.match(security, /ssl: \{ ca \}|verify-full/);
});

test('#408 every link in the concept resolves to a repository file', () => {
  for (const [, href] of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    assert.ok(existsSync(new URL(href.split('#')[0], documentUrl)), href);
  }
});
