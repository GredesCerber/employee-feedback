import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

const digest = { text: 'За неделю 12 обращений, просрочено 3.', highlights: ['Всего: 12.', 'Просрочено: 3.'],
  source: 'template', period: { from: '2026-11-04T12:00:00Z', to: '2026-11-11T12:00:00Z' }, generatedAt: '2026-11-11T12:00:00Z' };
let mode: 'template' | 'llm' | 'error' | 'pending' | 'html';
let queries: URLSearchParams[];
let finish: (value: Response) => void;

beforeEach(() => {
  mode = 'template'; queries = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/summary/digest') {
      queries.push(url.searchParams);
      if (mode === 'pending') return new Promise<Response>(resolve => { finish = resolve; });
      if (mode === 'error') return Response.json({ code: 'INTERNAL_ERROR', message: 'failure' }, { status: 500 });
      return Response.json({ ...digest, source: mode === 'llm' ? 'llm' : 'template',
        text: mode === 'html' ? '<img src=x onerror="alert(1)">' : digest.text });
    }
    if (url.pathname === '/analytics/trends') return Response.json({ generatedAt: digest.generatedAt,
      byDay: [], byWeek: [], byCategory: [], byDepartment: [], topThemes: [], overdue: [],
      totals: { total: 0, openCount: 0, closedCount: 0, overdueCount: 0, averageResolutionHours: null } });
    if (url.pathname === '/reference-data') return Response.json({ categories: [], assignees: [], departments: [{ id: 'procurement', name: 'Закупки' }] });
    return Response.json({ items: [], unreadCount: 0, total: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function openDashboard() {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByRole('heading', { name: 'Дашборд' });
  return user;
}
const card = () => screen.getByRole('region', { name: 'Сводка за неделю' });

it('#153 shows the weekly text, highlights, template source and retained snapshot time', async () => {
  const user = await openDashboard();
  await within(card()).findByText(digest.text);
  expect(within(card()).getByText('Всего: 12.')).toBeTruthy();
  expect(within(card()).getByText('Шаблон (без ИИ)')).toBeTruthy();
  expect(card().textContent).toMatch(/без ключа|недоступна/i);
  expect(card().querySelector('time')?.dateTime).toBe(digest.generatedAt);
  await user.click(within(card()).getByRole('button', { name: 'Обновить сводку за неделю' }));
  await waitFor(() => expect(queries).toHaveLength(2));
  await user.selectOptions(screen.getByLabelText('Подразделение'), 'procurement');
  await waitFor(() => expect(queries.at(-1)?.get('department')).toBe('procurement'));
});

it('#153 marks a successful model response as ИИ', async () => {
  mode = 'llm'; await openDashboard();
  expect(await within(card()).findByText('ИИ')).toBeTruthy();
  expect(within(card()).queryByText('Шаблон (без ИИ)')).toBeNull();
});

it('#153 renders loading, then an error with a working retry', async () => {
  mode = 'pending'; await openDashboard();
  expect(within(card()).getByRole('status').textContent).toMatch(/Загрузка сводки/);
  expect(card().querySelector('.digest-skeleton')).toBeTruthy();
  await act(async () => { finish(Response.json({ code: 'ERROR', message: 'failure' }, { status: 500 })); });
  expect(await within(card()).findByRole('alert')).toBeTruthy();
  mode = 'template';
  fireEvent.click(within(card()).getByRole('button', { name: 'Повторить' }));
  expect(await within(card()).findByText(digest.text)).toBeTruthy();
});

it('#153 treats model text as literal text, without inserting HTML', async () => {
  mode = 'html'; await openDashboard();
  expect(await within(card()).findByText('<img src=x onerror="alert(1)">')).toBeTruthy();
  expect(card().querySelector('img')).toBeNull();
});
