// #353: отчёт docs/ux-research-status.md сводит ресёрч #312 с финальной версией:
// каждая идея помечена «сделано (PR/issue)», «имитация» или «план».
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const doc = readFileSync(new URL('../../docs/ux-research-status.md', import.meta.url), 'utf8');
const rows = doc.split('\n').filter(line => line.startsWith('|') && !/^\|\s*-/.test(line) && !/^\|\s*(Идея|Что)\s*\|/.test(line));

test('#353 report lists every A and B proposal from the #312 research', () => {
  for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3']) {
    assert.ok(rows.some(row => row.startsWith(`| ${id}.`)), `нет строки для ${id}`);
  }
});

test('#353 every idea is marked done with a PR or issue, simulated or planned', () => {
  assert.ok(rows.length >= 12);
  for (const row of rows) {
    const status = row.split('|')[2]?.trim() ?? '';
    assert.match(status, /^(сделано|имитация|план|частично)/, row);
    if (status.startsWith('сделано')) assert.match(row, /#\d+|`[^`]+`/, `у «сделано» нет PR, issue или пути: ${row}`);
  }
});

test('#353 report references the related PRs instead of duplicating them', () => {
  for (const pr of ['#297', '#298', '#333', '#334', '#335']) assert.ok(doc.includes(pr), pr);
});
