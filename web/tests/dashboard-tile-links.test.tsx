import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

// #285: плитка «Просрочено» на дашборде руководителя ведёт в очередь с фильтром overdue=1.
type Trends = components['schemas']['AnalyticsTrends'];
const trends: Trends = {
  generatedAt: '2026-11-10T10:00:00Z',
  byDay: [{ date: '2026-11-10', count: 1 }],
  byWeek: [],
  byCategory: [],
  byDepartment: [],
  topThemes: [],
  overdue: [{ id: 'cmp-7', number: 'A-007', categoryId: 'training', categoryName: 'Обучение', dueAt: '2026-11-08T10:00:00Z', overdueHours: 48 }],
  totals: { total: 8, openCount: 7, closedCount: 1, overdueCount: 4, averageResolutionHours: 30.5 },
};
const reference = {
  departments: [{ id: 'engineering', name: 'Инженерный отдел' }],
  categories: [{ id: 'training', name: 'Обучение', assigneeId: null, dueInDays: 5 }],
  assignees: [],
};

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/analytics/trends') return Response.json(trends);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/summary') return Response.json({ total: 0, byType: [], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: trends.generatedAt });
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openDashboard(role: 'manager' | 'admin') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  await screen.findByRole('heading', { name: 'Дашборд', level: 1 });
  return user;
}

describe('#285 dashboard tile links', () => {
  it('manager: «Просрочено» links to the queue filtered by overdue=1', async () => {
    await openDashboard('manager');
    const tile = await screen.findByRole('region', { name: 'Просрочено' });
    const link = within(tile).getByRole('link', { name: 'Просрочено' });
    expect(link.getAttribute('href')).toBe('/queue?overdue=1');
  });

  it('admin: «Просрочено» is not a link', async () => {
    await openDashboard('admin');
    const tile = await screen.findByRole('region', { name: 'Просрочено' });
    expect(within(tile).queryByRole('link')).toBeNull();
  });
});
