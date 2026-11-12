import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';
import { catalog } from '../src/i18n';

const reference = { categories: [{ id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: 'manager-1' }], departments: [{ id: 'procurement', name: 'Закупки' }], assignees: [] };
const item = (n: number, owner: string | null) => ({
  id: 'id-' + n, number: 'A-' + String(n).padStart(3, '0'), type: 'problem', categoryId: 'cross_department', departmentId: 'procurement', description: 'Обращение ' + n,
  status: 'new', overdue: false, dueAt: '2026-11-08T09:00:00Z', createdAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z',
  author: { id: 'employee-1', name: 'Сотрудник', role: 'employee', departmentId: 'procurement' },
  assignee: owner ? { id: owner, name: owner, role: 'manager', departmentId: 'procurement' } : null,
  routing: { queue: owner ? 'assigned' : 'unassigned', reason: 'rule' }, nextAction: '', comments: [], history: [], attachments: [], decision: null, proposedSolution: null, firstResponseAt: null,
});
const records = [...Array.from({ length: 25 }, (_, n) => item(n + 1, 'manager-1')), item(90, 'manager-2'), item(91, null)];
let requests: URL[];
beforeEach(() => {
  requests = []; localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url); requests.push(url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/summary') return Response.json({ total: 0, byType: [], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: '2026-11-01T09:00:00Z' });
    if (url.pathname === '/complaints/export') return new Response('csv', { headers: { 'Content-Type': 'text/csv' } });
    if (url.pathname === '/complaints') {
      const filtered = records.filter(record => !url.searchParams.has('assignee') || record.assignee?.id === 'manager-1');
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
async function open(entry = '/queue') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[entry]}><App /><Location /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByRole('link', { name: 'A-001' });
  return user;
}
const group = () => within(screen.getByRole('group', { name: 'Назначение' }));

it('selects mine, preserves filters in URL and list request, and can return to all', async () => {
  const user = await open('/queue?status=new&departmentId=procurement');
  expect(group().getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('true');
  await user.click(group().getByRole('button', { name: 'Мои' }));
  await waitFor(() => expect(lists().at(-1)?.searchParams.get('assignee')).toBe('me'));
  expect(params().get('assignee')).toBe('me'); expect(params().get('status')).toBe('new');
  expect(params().get('departmentId')).toBe('procurement');
  expect(group().getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed')).toBe('true');
  await user.click(group().getByRole('button', { name: 'Все' }));
  await waitFor(() => expect(params().has('assignee')).toBe(false));
  expect(params().get('status')).toBe('new');
});

it('restores mine from URL and preserves it for quick filters, pagination and CSV; reset clears it', async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:csv'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const user = await open('/queue?assignee=me&status=new');
  expect(group().getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(lists().at(-1)?.searchParams.get('assignee')).toBe('me'));
  await user.click(within(screen.getByRole('group', { name: 'Быстрые фильтры' })).getByRole('button', { name: 'Новые' }));
  expect(params().get('assignee')).toBe('me');
  await user.click(await screen.findByRole('button', { name: 'Далее' }));
  await waitFor(() => expect(lists().at(-1)?.searchParams.get('offset')).toBe('20'));
  expect(lists().at(-1)?.searchParams.get('assignee')).toBe('me');
  await user.click(screen.getByRole('button', { name: 'Скачать CSV' }));
  await waitFor(() => expect(requests.some(url => url.pathname === '/complaints/export')).toBe(true));
  const exported = requests.find(url => url.pathname === '/complaints/export')!.searchParams;
  expect(exported.get('assignee')).toBe('me'); expect(exported.get('status')).toBe('new');
  await user.click(screen.getByRole('button', { name: 'Сбросить' }));
  await waitFor(() => expect(params().toString()).toBe(''));
  expect(group().getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('true');
});

it('does not show the manager selector to an administrator on a direct queue URL', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/queue']}><App /><Location /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('/queue'));
  expect(screen.queryByRole('group', { name: 'Назначение' })).toBeNull();
});

it.each(['en', 'kk'] as const)('localizes the selector in %s', async locale => {
  const user = await open();
  await user.selectOptions(screen.getByLabelText('Language / Язык / Тіл'), locale);
  for (const key of ['Назначение', 'Мои']) {
    expect(catalog[locale][key]).toBeTruthy();
    expect(catalog[locale][key]).not.toBe(key);
  }
  const translated = within(screen.getByRole('group', { name: catalog[locale]['Назначение']! }));
  expect(translated.getByRole('button', { name: catalog[locale]['Мои']! })).toBeTruthy();
  expect(translated.getByRole('button', { name: catalog[locale]['Все']! })).toBeTruthy();
});
