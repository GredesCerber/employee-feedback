import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';

// #126: поиск в очереди (debounce 300 мс, параметр q, адресная строка) и кнопка «Скачать CSV».
const reference = { categories: [{ id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: 'manager-1' }], departments: [{ id: 'procurement', name: 'Закупки' }], assignees: [] };
const item = (number: string) => ({
  id: `id-${number}`, number, type: 'problem', categoryId: 'cross_department', departmentId: 'procurement', description: `Обращение ${number}`,
  status: 'in_review', overdue: false, dueAt: '2026-11-08T09:00:00Z', createdAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z',
  author: { id: 'employee-1', name: 'Сотрудник', role: 'employee', departmentId: 'procurement' }, assignee: null,
  routing: { queue: 'unassigned', reason: 'no_rule' }, nextAction: '', comments: [], history: [], attachments: [], decision: null, proposedSolution: null, firstResponseAt: null,
});
let requests: URL[];

beforeEach(() => {
  requests = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    requests.push(url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints/export') return new Response('﻿номер,тип\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    if (url.pathname === '/complaints') {
      const q = url.searchParams.get('q');
      if (q === 'нетТакого' || url.searchParams.get('status') === 'rejected') return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
      const items = q ? [item('A-777')] : [item('A-001'), item('A-002')];
      return Response.json({ items, total: items.length, limit: 20, offset: 0 });
    }
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
const listRequests = () => requests.filter(url => url.pathname === '/complaints' && url.searchParams.get('limit') === '20');
const urlParams = () => new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1] ?? '');

async function openQueue(entry = '/queue') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[entry]}><App /><LocationProbe /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByLabelText('Поиск по номеру или тексту');
  await waitFor(() => expect(listRequests().length).toBeGreaterThan(0));
  return user;
}

describe('queue search', () => {
  it.each([
    '/queue?status=rejected',
    '/queue?status=rejected&q=нетТакого&departmentId=procurement&categoryId=cross_department&queue=unassigned&overdue=1&hideSimulated=1&dueAfter=2026-11-01&dueBefore=2026-11-20',
  ])('#264 resets every condition from the empty queue without opening filters: %s', async entry => {
    const user = await openQueue(entry);
    const reset = await screen.findByRole('button', { name: 'Сбросить фильтры', exact: true });
    expect(screen.getByRole('button', { name: 'Фильтры', exact: true }).getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('queue-filters')!.contains(reset)).toBe(false);
    await user.click(reset);
    expect(await screen.findByRole('link', { name: 'A-001' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Очередь обращений', exact: true }));
    expect(urlParams().toString()).toBe('');
    expect((screen.getByLabelText('Поиск по номеру или тексту') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Статус') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Скрыть имитацию') as HTMLInputElement).checked).toBe(false);
    const params = listRequests().at(-1)!.searchParams;
    expect(params.get('offset')).toBe('0');
    expect([...params.keys()].sort()).toEqual(['limit', 'offset']);
  });

  it('sends q and updates the address only after a 300 ms pause, one request for the whole input', async () => {
    const user = await openQueue();
    const before = listRequests().length;
    const typedAt = Date.now();
    await user.type(screen.getByLabelText('Поиск по номеру или тексту'), 'закупка');
    expect(listRequests().length).toBe(before);
    expect(urlParams().get('q')).toBeNull();
    await waitFor(() => expect(urlParams().get('q')).toBe('закупка'));
    expect(Date.now() - typedAt).toBeGreaterThanOrEqual(290);
    expect(await screen.findByRole('link', { name: 'A-777' })).toBeTruthy();
    const withQ = listRequests().filter(url => url.searchParams.has('q'));
    expect(withQ).toHaveLength(1);
    expect(withQ[0]!.searchParams.get('q')).toBe('закупка');
  });

  it('restores the search field from the address and keeps other filters when searching', async () => {
    const user = await openQueue('/queue?status=in_review&q=болт');
    const field = screen.getByLabelText('Поиск по номеру или тексту') as HTMLInputElement;
    expect(field.value).toBe('болт');
    await user.clear(field);
    await user.type(field, 'гайка');
    await waitFor(() => expect(urlParams().get('q')).toBe('гайка'));
    expect(urlParams().get('status')).toBe('in_review');
  });

  it('shows an empty state with «Сбросить поиск» that clears only the search', async () => {
    const user = await openQueue('/queue?status=in_review');
    await user.type(screen.getByLabelText('Поиск по номеру или тексту'), 'нетТакого');
    expect(await screen.findByText(/обращений нет/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Сбросить поиск' }));
    expect(await screen.findByRole('link', { name: 'A-001' })).toBeTruthy();
    expect(urlParams().get('q')).toBeNull();
    expect(urlParams().get('status')).toBe('in_review');
    expect((screen.getByLabelText('Поиск по номеру или тексту') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: 'Сбросить поиск' })).toBeNull();
  });
});

describe('queue CSV export', () => {
  it('downloads obrasheniya-<date>.csv with the current filters and search', async () => {
    const createObjectURL = vi.fn(() => 'blob:csv'), revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const downloads: { name: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push({ name: this.download, href: this.href }); });
    const user = await openQueue('/queue?status=in_review&q=болт');
    await user.click(screen.getByRole('button', { name: 'Скачать CSV' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.name).toMatch(/^obrasheniya-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloads[0]!.href).toBe('blob:csv');
    const exportRequest = requests.find(url => url.pathname === '/complaints/export')!;
    expect(exportRequest.searchParams.get('q')).toBe('болт');
    expect(exportRequest.searchParams.get('status')).toBe('in_review');
    expect(exportRequest.searchParams.has('limit')).toBe(false);
    expect(exportRequest.searchParams.has('offset')).toBe(false);
  });

  it('shows an error and no file when the export fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      requests.push(url);
      if (url.pathname === '/reference-data') return Response.json(reference);
      if (url.pathname === '/complaints/export') return Response.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 });
      return Response.json({ items: [item('A-001')], total: 1, limit: 20, offset: 0 });
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = await openQueue();
    await user.click(screen.getByRole('button', { name: 'Скачать CSV' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(click).not.toHaveBeenCalled();
  });

  it('has no CSV button for the employee role', async () => {
    render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
    expect(await screen.findByLabelText('Демонстрационная роль')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Скачать CSV' })).toBeNull();
  });
});
