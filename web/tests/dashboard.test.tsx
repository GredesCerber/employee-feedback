import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

// #152: дашборд руководителя — плитки, линия по дням, столбики по категориям и подразделениям, просроченные.
type Trends = components['schemas']['AnalyticsTrends'];
const days = Array.from({ length: 14 }, (_, index) => `2026-10-${String(28 + index > 31 ? 28 + index - 31 : 28 + index).padStart(2, '0')}`)
  .map((date, index) => ({ date: index < 4 ? date : date.replace('2026-10-', '2026-11-'), count: index % 3 }));
const seeded: Trends = {
  generatedAt: '2026-11-10T10:00:00Z',
  byDay: days.map((day, index) => index === 13 ? { ...day, count: 5 } : day),
  byWeek: Array.from({ length: 8 }, (_, index) => ({ weekStart: `2026-09-${String(21 + index).padStart(2, '0')}`, count: index })),
  byCategory: [
    { categoryId: 'cross_department', categoryName: 'Межотдельное взаимодействие', count: 6 },
    { categoryId: 'training', categoryName: 'Обучение', count: 2 },
  ],
  byDepartment: [
    { departmentId: 'engineering', departmentName: 'Инженерный отдел', count: 5, closedCount: 1, closedShare: 0.2 },
    { departmentId: 'procurement', departmentName: 'Снабжение', count: 3, closedCount: 0, closedShare: 0 },
  ],
  topThemes: [],
  overdue: [{ id: 'cmp-7', number: 'A-007', categoryId: 'training', categoryName: 'Обучение', dueAt: '2026-11-08T10:00:00Z', overdueHours: 48 }],
  totals: { total: 8, openCount: 7, closedCount: 1, overdueCount: 1, averageResolutionHours: 30.5 },
};
const empty: Trends = {
  ...seeded, byDay: seeded.byDay.map(day => ({ ...day, count: 0 })), byWeek: seeded.byWeek.map(week => ({ ...week, count: 0 })),
  byCategory: [], byDepartment: [], overdue: [], totals: { total: 0, openCount: 0, closedCount: 0, overdueCount: 0, averageResolutionHours: null },
};
const procurementOnly: Trends = {
  ...seeded, byCategory: [{ categoryId: 'training', categoryName: 'Обучение', count: 3 }],
  byDepartment: [seeded.byDepartment[1]!], overdue: [], totals: { total: 3, openCount: 3, closedCount: 0, overdueCount: 0, averageResolutionHours: null },
};
const reference = {
  departments: [{ id: 'engineering', name: 'Инженерный отдел' }, { id: 'procurement', name: 'Снабжение' }],
  categories: [{ id: 'training', name: 'Обучение', assigneeId: null, dueInDays: 5 }],
  assignees: [],
};

let data: Trends;
let trendRequests: URL[];
beforeEach(() => {
  data = structuredClone(seeded);
  trendRequests = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/analytics/trends') {
      trendRequests.push(url);
      return Response.json(url.searchParams.get('department') === 'procurement' ? procurementOnly : data);
    }
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/summary') return Response.json({ total: 0, byType: [], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: seeded.generatedAt });
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const menu = () => within(screen.getByRole('navigation', { name: 'Основное меню' }));

async function openDashboard(role: 'manager' | 'admin' = 'manager') {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  await user.click(menu().getByRole('link', { name: 'Дашборд' }));
  await screen.findByRole('heading', { name: 'Дашборд', level: 1 });
  return user;
}

describe('#152 manager dashboard', () => {
  it('shows tiles: total, open, overdue and average resolution time', async () => {
    await openDashboard();
    expect(within(await screen.findByRole('region', { name: 'Всего обращений' })).getByText('8')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Открытых' })).getByText('7')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Просрочено' })).getByText('1')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Среднее время решения' })).getByText(/30,5\s*ч/)).toBeTruthy();
  });

  it('draws a 14-day SVG line with axis titles and a table alternative', async () => {
    await openDashboard();
    const chart = await screen.findByRole('img', { name: /Обращения по дням/ });
    expect(chart.tagName.toLowerCase()).toBe('svg');
    expect(chart.querySelectorAll('[data-point]')).toHaveLength(14);
    expect(chart.querySelector('polyline')).toBeTruthy();
    expect(chart.textContent).toContain('Дата');
    expect(chart.textContent).toContain('Обращений');
    const table = screen.getByRole('table', { name: 'Обращения по дням' });
    expect(within(table).getAllByRole('row')).toHaveLength(15);
    expect(within(table).getByRole('row', { name: /10\.11.*5/ })).toBeTruthy();
  });

  it('draws SVG bars by category and by department with tables', async () => {
    await openDashboard();
    const categories = await screen.findByRole('img', { name: /Обращения по категориям/ });
    expect(categories.querySelector('[data-bar="Межотдельное взаимодействие"]')?.textContent).toContain('6');
    const departments = screen.getByRole('img', { name: /Обращения по подразделениям/ });
    expect(departments.querySelector('[data-bar="Снабжение"]')?.textContent).toContain('3');
    expect(within(screen.getByRole('table', { name: 'Обращения по категориям' })).getByRole('row', { name: 'Обучение 2' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Обращения по подразделениям' })).getByRole('row', { name: /Инженерный отдел 5/ })).toBeTruthy();
    expect(screen.getAllByText('По горизонтали — число обращений').length).toBeGreaterThanOrEqual(2);
  });

  it('lists overdue complaints with links to the card', async () => {
    await openDashboard();
    const list = await screen.findByRole('list', { name: 'Просроченные обращения' });
    const link = within(list).getByRole('link', { name: /A-007/ });
    expect(link.getAttribute('href')).toBe('/queue/cmp-7');
    expect(within(list).getByText(/Обучение/)).toBeTruthy();
    expect(within(list).getByText(/48\s*ч/)).toBeTruthy();
  });

  it('shows a readable empty state without charts or console errors', async () => {
    data = structuredClone(empty);
    const errors = vi.spyOn(console, 'error');
    await openDashboard();
    expect((await screen.findByText(/Обращений пока нет/)).getAttribute('role')).toBe('status');
    expect(screen.queryByRole('img', { name: /по категориям/ })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Просроченные обращения' })).toBeNull();
    expect(screen.getByText('Просроченных обращений нет.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Среднее время решения' })).getByText('Нет закрытых')).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });

  it('redraws every widget for the selected department', async () => {
    const user = await openDashboard();
    await screen.findByRole('img', { name: /по категориям/ });
    await user.selectOptions(screen.getByLabelText('Подразделение'), 'procurement');
    await screen.findByRole('region', { name: 'Всего обращений' });
    await within(screen.getByRole('region', { name: 'Всего обращений' })).findByText('3');
    expect(trendRequests.at(-1)?.searchParams.get('department')).toBe('procurement');
    const categories = screen.getByRole('img', { name: /по категориям/ });
    expect(categories.querySelector('[data-bar="Межотдельное взаимодействие"]')).toBeNull();
    expect(categories.querySelector('[data-bar="Обучение"]')?.textContent).toContain('3');
    expect(screen.getByText('Просроченных обращений нет.')).toBeTruthy();
  });

  it('is available to admin too, but not to employee', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(menu().queryByRole('link', { name: 'Дашборд' })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
    expect(menu().getByRole('link', { name: 'Дашборд' })).toBeTruthy();
  });

  it('does not open the dashboard through a direct employee URL', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Мои обращения');
  });

  it('uses only design tokens for chart colours and stacks widgets in one column on narrow screens', () => {
    const src = existsSync(resolve('src/pages')) ? resolve('src') : resolve('web/src');
    const css = readFileSync(join(src, 'pages/dashboard.css'), 'utf8');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(css).toMatch(/var\(--color-primary\)/);
    expect(css).toMatch(/@media \(max-width: [0-9]+px\)[^}]*\.dashboard-grid \{[^}]*grid-template-columns: (1fr|minmax\(0, 1fr\))/);
  });
});
