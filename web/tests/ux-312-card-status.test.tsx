import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { I18nProvider } from '../src/i18n';
import type { Complaint } from '../src/features/complaint';
import { progressModel } from '../src/features/statusProgress';
import { CopyNumber, daysUntil, WhatNext } from '../src/features/complaintFollowUp';
import { statusTransitions } from '../src/api/policy';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
let current: Complaint;

function event(fromStatus: Complaint['status'] | null, toStatus: Complaint['status'] | null, id: string): Complaint['history'][number] {
  return { id, kind: 'status_changed', actor: null, createdAt: '2026-11-10T10:00:00Z', fromStatus, toStatus, text: 'Руководитель изменил статус.' };
}
const states = (item: Pick<Complaint, 'status' | 'history'>) => progressModel(item).steps.map(step => step.state);

beforeEach(() => {
  current = structuredClone(example);
  sessionStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints' && request.method === 'POST') return Response.json(current, { status: 201 });
    if (url.pathname === '/complaints') return Response.json({ items: [current], total: 1, limit: 20, offset: 0 });
    return Response.json(current);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function openCard() {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.click(await screen.findByRole('link', { name: current.number }));
  await screen.findByRole('heading', { name: `Обращение ${current.number}` });
  return user;
}

describe('#312 A1: шкала статуса', () => {
  it('покрывает все статусы контракта', () => {
    for (const status of Object.keys(statusTransitions) as Complaint['status'][]) {
      const model = progressModel({ status, history: [] });
      expect(model.steps.filter(step => step.state === 'current')).toHaveLength(1);
    }
  });

  it('ведёт Подано → На рассмотрении → В работе → Итог', () => {
    expect(states({ status: 'new', history: [] })).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(states({ status: 'in_review', history: [event('new', 'in_review', '1')] })).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(states({ status: 'in_progress', history: [event('new', 'in_review', '1'), event('in_review', 'in_progress', '2')] })).toEqual(['done', 'done', 'current', 'upcoming']);
    const done = progressModel({ status: 'implemented', history: [event('new', 'in_review', '1'), event('in_review', 'in_progress', '2'), event('in_progress', 'implemented', '3')] });
    expect(done.steps.map(step => step.state)).toEqual(['done', 'done', 'done', 'current']);
    expect(done.steps[3]?.label).toBe('Реализовано');
  });

  it('честно помечает пропущенные шаги: отказ сразу из «Новое»', () => {
    const model = progressModel({ status: 'rejected', history: [event('new', 'rejected', '1')] });
    expect(model.steps.map(step => step.state)).toEqual(['done', 'skipped', 'skipped', 'current']);
    expect(model.steps[3]?.label).toBe('Отклонено');
  });

  it('«Ожидает уточнения» — ветка от шага, где запросили уточнение', () => {
    const fromWork = progressModel({ status: 'awaiting_clarification', history: [event('new', 'in_review', '1'), event('in_review', 'in_progress', '2'), event('in_progress', 'awaiting_clarification', '3')] });
    expect(fromWork.clarification).toBe(true);
    expect(fromWork.steps.map(step => step.state)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(progressModel({ status: 'awaiting_clarification', history: [event('new', 'awaiting_clarification', '1')] }).steps[0]?.state).toBe('current');
  });

  it('на карточке текущий шаг помечен aria-current="step"', async () => {
    current = { ...current, status: 'in_review', history: [...current.history, event('new', 'in_review', 'h-review')] };
    await openCard();
    const scale = screen.getByRole('navigation', { name: 'Ход рассмотрения' });
    const items = within(scale).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    const active = items.filter(item => item.getAttribute('aria-current') === 'step');
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toContain('На рассмотрении');
    expect(active[0]?.textContent).toContain('текущий шаг');
    expect(items[0]?.textContent).toContain('пройден');
  });

  it('показывает ветку уточнения на карточке', async () => {
    current = { ...current, status: 'awaiting_clarification', history: [...current.history, event('new', 'in_review', 'a'), event('in_review', 'awaiting_clarification', 'b')] };
    await openCard();
    const active = within(screen.getByRole('navigation', { name: 'Ход рассмотрения' })).getAllByRole('listitem').find(item => item.getAttribute('aria-current') === 'step');
    expect(active?.textContent).toContain('На рассмотрении');
    expect(active?.textContent).toContain('ждём уточнения от автора');
  });
});

describe('#312 A6: срок и ответственный', () => {
  it('daysUntil считает календарные дни и не падает на нечитаемой дате', () => {
    const now = Date.parse('2026-11-10T10:00:00Z');
    expect(daysUntil('2026-11-17T10:00:00Z', now)).toBe(7);
    expect(daysUntil('2026-11-09T10:00:00Z', now)).toBe(-1);
    expect(daysUntil('не дата', now)).toBeNull();
  });

  it('показывает ответственного с подразделением, срок и правило категории из справочника', () => {
    render(<I18nProvider><WhatNext item={current} reference={reference} /></I18nProvider>);
    const block = screen.getByRole('region', { name: 'Что будет дальше' });
    expect(block.textContent).toContain(`${current.assignee!.name} · Закупки`);
    const dueInDays = reference.categories.find((category: { id: string }) => category.id === current.categoryId).dueInDays;
    expect(block.textContent).toContain(`${dueInDays} календарных дней`);
    expect(block.textContent).toContain('до ');
  });

  it('без ответственного не выдумывает имя', () => {
    render(<I18nProvider><WhatNext item={{ ...current, assignee: null }} reference={reference} /></I18nProvider>);
    const block = screen.getByRole('region', { name: 'Что будет дальше' });
    expect(block.textContent).toContain('Ожидает назначения');
    expect(block.textContent).toContain('Руководитель назначит ответственного вручную');
  });

  it('карточка: строка «Срок ответа: до …» для незавершённого обращения', async () => {
    await openCard();
    expect(await screen.findByText(/Срок ответа: до/)).toBeTruthy();
  });

  it('на итоговом статусе строки со сроком нет', async () => {
    current = { ...current, status: 'closed' };
    await openCard();
    expect(screen.queryByText(/Срок ответа: до/)).toBeNull();
  });
});

describe('#312 A8: копирование номера', () => {
  it('копирует номер и объявляет «Скопировано»', async () => {
    const writeText = vi.fn(async () => undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<I18nProvider><p id="n">A-021</p><CopyNumber number="A-021" targetId="n" /></I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Копировать номер' }));
    expect(writeText).toHaveBeenCalledWith('A-021');
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Скопировано');
  });

  it('без Clipboard API выделяет номер и подсказывает скопировать вручную', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<I18nProvider><p id="n">A-021</p><CopyNumber number="A-021" targetId="n" /></I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Копировать номер' }));
    expect(screen.getByRole('status').textContent).toContain('скопируйте его вручную');
    expect(window.getSelection()?.toString()).toBe('A-021');
  });

  it('если запись в буфер отклонена — тоже мягкий запасной вариант', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied'); }) }, configurable: true });
    render(<I18nProvider><p id="n">A-021</p><CopyNumber number="A-021" targetId="n" /></I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Копировать номер' }));
    expect(screen.getByRole('status').textContent).toContain('Не удалось скопировать');
  });

  it('экран результата: номер, кнопка копирования и «Что будет дальше»', async () => {
    current = { ...current, number: 'A-099' };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/submit']}><App /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Межотдельное взаимодействие' });
    await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
    await user.type(screen.getByLabelText('Описание'), 'Не хватает параметров.');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    await screen.findByRole('heading', { name: 'Обращение зарегистрировано' });
    expect(document.querySelector('.registration-number')?.textContent).toBe('A-099');
    expect(screen.getByRole('button', { name: 'Копировать номер' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Что будет дальше' }).textContent).toContain(current.assignee!.name);
  });
});
