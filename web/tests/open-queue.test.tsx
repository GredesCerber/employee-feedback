import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';
import { catalog } from '../src/i18n';

const reference = { categories: [{ id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: 'manager-1' }], departments: [{ id: 'procurement', name: 'Закупки' }], assignees: [] };
const statuses = ['new', 'in_review', 'in_progress', 'awaiting_clarification', 'closed'];
const records = Array.from({ length: 31 }, (_, n) => ({
  id: 'id-' + n, number: 'A-' + String(n).padStart(3, '0'), type: 'problem', categoryId: 'cross_department', departmentId: 'procurement', description: 'Обращение ' + n,
  status: statuses[n % statuses.length], overdue: false, dueAt: '2026-11-08T09:00:00Z', createdAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z',
  author: { id: 'employee-1', name: 'Сотрудник', role: 'employee', departmentId: 'procurement' }, assignee: null,
  routing: { queue: 'unassigned', reason: 'no_rule' }, nextAction: '', comments: [], history: [], attachments: [], decision: null, proposedSolution: null, firstResponseAt: null,
}));
const openRecords = records.filter(item => item.status !== 'closed');
const trends = { generatedAt: '2026-11-10T10:00:00Z', byDay: [], byWeek: [], byCategory: [], byDepartment: [], topThemes: [], overdue: [],
  totals: { total: records.length, openCount: openRecords.length, closedCount: records.length - openRecords.length, overdueCount: 0, averageResolutionHours: null } };
let requests: URL[];
beforeEach(() => {
  requests = []; localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url); requests.push(url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/analytics/trends') return Response.json(trends);
    if (url.pathname === '/summary') return Response.json({ total: 0, byType: [], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: trends.generatedAt });
    if (url.pathname === '/complaints/export') return new Response('csv', { headers: { 'Content-Type': 'text/csv' } });
    if (url.pathname === '/complaints') {
      const filtered = url.searchParams.get('status_group') === 'open' ? openRecords : records;
      const limit = Number(url.searchParams.get('limit') ?? 20), offset = Number(url.searchParams.get('offset') ?? 0);
      return Response.json({ items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset });
    }
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function Location() { const loc = useLocation(); return <output data-testid="location">{loc.pathname + loc.search}</output>; }
const params = () => new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1] ?? '');
const lists = () => requests.filter(url => url.pathname === '/complaints' && url.searchParams.get('limit') === '20');
async function open(entry: string, role: 'manager' | 'admin' = 'manager') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[entry]}><App /><Location /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  return user;
}

it('manager opens the matching queue from the tile and keeps selected department', async () => {
  const user = await open('/dashboard');
  const tile = await screen.findByRole('region', { name: 'Открытых' });
  expect(within(tile).getByText(String(openRecords.length))).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Подразделение'), 'procurement');
  const link = within(await screen.findByRole('region', { name: 'Открытых' })).getByRole('link');
  const href = new URL(link.getAttribute('href')!, 'http://localhost');
  expect(href.pathname).toBe('/queue'); expect(href.searchParams.get('status_group')).toBe('open');
  expect(href.searchParams.get('departmentId')).toBe('procurement');
  await user.click(link);
  await waitFor(() => expect(lists().at(-1)?.searchParams.get('status_group')).toBe('open'));
  expect(lists().at(-1)?.searchParams.get('departmentId')).toBe('procurement');
  expect(await screen.findByText('Найдено: ' + openRecords.length)).toBeTruthy();
  expect((screen.getByLabelText('Только открытые') as HTMLInputElement).checked).toBe(true);
});

it('admin sees open count without a queue link', async () => {
  const user = await open('/dashboard', 'admin');
  if (!screen.queryByRole('heading', { name: 'Дашборд' })) await user.click(screen.getByRole('link', { name: 'Дашборд' }));
  const tile = await screen.findByRole('region', { name: 'Открытых' });
  expect(within(tile).getByText(String(openRecords.length))).toBeTruthy();
  expect(within(tile).queryByRole('link')).toBeNull();
});

it('restores open filter and preserves it through apply, search, pagination and CSV, then resets it', async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:csv'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const user = await open('/queue?status_group=open');
  const checkbox = await screen.findByLabelText('Только открытые') as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  expect((screen.getByLabelText('Статус') as HTMLSelectElement).value).toBe('');
  await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
  await user.click(screen.getByRole('button', { name: 'Применить фильтры' }));
  await waitFor(() => expect(params().get('categoryId')).toBe('cross_department'));
  expect(params().get('status_group')).toBe('open');
  await user.type(screen.getByLabelText('Поиск по номеру или тексту'), 'заявка');
  await waitFor(() => expect(params().get('q')).toBe('заявка'));
  expect(params().get('status_group')).toBe('open');
  await user.click(await screen.findByRole('button', { name: 'Далее' }));
  await waitFor(() => expect(lists().at(-1)?.searchParams.get('offset')).toBe('20'));
  expect(lists().at(-1)?.searchParams.get('status_group')).toBe('open');
  await user.click(screen.getByRole('button', { name: 'Скачать CSV' }));
  await waitFor(() => expect(requests.some(url => url.pathname === '/complaints/export')).toBe(true));
  const exported = requests.find(url => url.pathname === '/complaints/export')!.searchParams;
  expect(exported.get('status_group')).toBe('open'); expect(exported.get('categoryId')).toBe('cross_department'); expect(exported.get('q')).toBe('заявка');
  await user.click(screen.getByRole('button', { name: 'Сбросить' }));
  await waitFor(() => expect(params().toString()).toBe(''));
  expect((screen.getByLabelText('Только открытые') as HTMLInputElement).checked).toBe(false);
});

it.each(['en', 'kk'] as const)('localizes the open filter in %s', async locale => {
  const user = await open('/queue?status_group=open');
  await screen.findByLabelText('Только открытые');
  await user.selectOptions(screen.getByLabelText('Language / Язык / Тіл'), locale);
  const label = catalog[locale]['Только открытые'];
  expect(label).toBeTruthy(); expect(label).not.toBe('Только открытые');
  expect((screen.getByLabelText(label!) as HTMLInputElement).checked).toBe(true);
});
