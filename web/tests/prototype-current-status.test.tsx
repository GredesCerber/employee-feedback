import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABOUT_ROWS } from '../src/features/demo';

describe('#245 current capabilities on the honest demo page', () => {
  it('#259 describes recurring topics as category counts rather than keyword matching', () => {
    const row = ABOUT_ROWS.find(item => item.req === 'R7' && item.feature.startsWith('Сводка:'))!;
    expect(row.imitation).toContain('категории с двумя и более обращениями');
    expect(row.imitation).not.toMatch(/ключев[а-яё]* слов/);
    expect(row.plan).toBe('семантический поиск дублей');
  });

  it('acknowledges the in-app bell while keeping external delivery in the plan', () => {
    const row = ABOUT_ROWS.find(item => item.feature === 'Уведомления автору и ответственным')!;
    expect(row.build).toMatch(/колокольчик.*счётчик.*ссылк/i);
    expect(row.build).not.toMatch(/ещё нет|задача #127/);
    expect(row.plan).toMatch(/email.*Битрикс24/i);
    expect(row.imitation).toMatch(/список событий/);
  });

  it('distinguishes optional live AI, offline fallbacks and the planned draft reply', () => {
    const row = ABOUT_ROWS.find(item => item.feature.startsWith('ИИ-помощник'))!;
    expect(row.done).toMatch(/подсказка категории.*сводка/);
    expect(row.imitation).toMatch(/записанные.*локальные правила.*шаблон/);
    expect(row.build).toMatch(/жив[а-яё]* модель.*ключ/i);
    for (const label of ['ИИ', 'Демо ИИ', 'Правила (без ИИ)', 'Шаблон (без ИИ)']) {
      expect(row.build).toContain(label);
    }
    expect(row.plan).toMatch(/черновик ответа/);
    expect(row.done).not.toMatch(/черновик/);
  });

  it('describes the missing UI flag without denying the contract or constraining API progress', () => {
    const row = ABOUT_ROWS.find(item => item.feature.startsWith('Анонимная подача'))!;
    const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    expect(contract.components.schemas.CreateComplaint.properties.anonymous.type).toBe('boolean');
    expect(row.plan).toMatch(/флажок.*форм/i);
    expect(row.build).toMatch(/текст.*вложения.*раскры/i);
    expect(JSON.stringify(row)).not.toMatch(/контракт запрещает|в MVP не реализуется/);
  });
});
