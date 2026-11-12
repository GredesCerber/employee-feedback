import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const doc = await readFile(fileURLToPath(new URL('../../docs/research/submission-checklist.md', import.meta.url)), 'utf8');

test('#360 checklist lists every organizer form field with what we fill in', () => {
  assert.match(doc, /Название команды/);
  assert.match(doc, /Email капитана/);
  assert.match(doc, /Ссылка на проект на GitHub/);
});

test('#360 checklist names the team Caliginous and the person responsible for sending', () => {
  assert.match(doc, /Caliginous/);
  assert.match(doc, /Ответственный за отправку: \*\*капитан команды/);
});

test('#360 checklist states the deadline with a margin of at least one hour', () => {
  assert.match(doc, /13 ноября 2026, 14:00/);
  assert.match(doc, /не позже 13:00/);
});

test('#360 checklist says what to do if the demo is unavailable', () => {
  assert.match(doc, /Если демо недоступно/);
  assert.match(doc, /записанное видео демо/);
});

test('#360 checklist has a result column so each link can be verified', () => {
  assert.match(doc, /Результат проверки/);
  assert.match(doc, /инкогнито/);
});
