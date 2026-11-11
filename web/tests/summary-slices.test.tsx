import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

// #130: срезы сводки по подразделениям и категориям, карточка просрочки, сброс демо.
type Summary = components['schemas']['Summary'];
const seeded: Summary = {
  total: 20,
  byType: [{ type: 'problem', count: 9 }, { type: 'suggestion', count: 10 }, { type: 'praise', count: 1 }],
  closedCount: 4, closedShare: 0.2, averageFirstResponseHours: 9.6, respondedCount: 5,
  recurringTopics: [{ categoryId: 'training', categoryName: 'Обучение', count: 2 }],
  generatedAt: '2026-11-10T10:00:00Z',
  byDepartment: [
    { departmentId: 'design', departmentName: 'Проектирование', count: 12, closedCount: 3, closedShare: 0.25 },
    { departmentId: 'procurement', departmentName: 'Закупки', count: 0, closedCount: 0, closedShare: 0 },
  ],
  avgResolutionHoursByCategory: [
    { categoryId: 'safety', categoryName: 'Охрана труда', closedCount: 2, averageResolutionHours: 30.5 },
    { categoryId: 'training', categoryName: 'Обучение', closedCount: 0, averageResolutionHours: null },
  ],
  overdueCount: 3,
};
let data: Summary;
let resetStatus: number;
let requests: Request[];
beforeEach(() => {
  data = structuredClone(seeded); resetStatus = 200; requests = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (path === '/summary') return Response.json(data);
    if (path === '/demo/reset') {
      if (resetStatus === 200) return Response.json({ loadedCount: 20 });
      if (resetStatus === 404) return Response.json({ code: 'NOT_FOUND', message: 'Сброс демо недоступен в этой среде.' }, { status: 404 });
      return Response.json({ code: 'INTERNAL_ERROR', message: 'x' }, { status: 500 });
    }
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openSummary() {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
  await screen.findByRole('heading', { name: 'Сводка', level: 1 });
  return user;
}
const summaryCalls = () => requests.filter(request => new URL(request.url).pathname === '/summary').length;
const resetCalls = () => requests.filter(request => request.method === 'POST' && new URL(request.url).pathname === '/demo/reset').length;
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map(cell => (cell.textContent ?? '').replace(/\s/g, ''));

describe('#130 summary slices', () => {
  it('shows a table by department with count, closed and share, including zero rows', async () => {
    await openSummary();
    const table = await screen.findByRole('table', { name: 'Обращения по подразделениям' });
    expect(cells(within(table).getByRole('row', { name: /Проектирование/ }))).toEqual(['12', '3', '25%']);
    expect(cells(within(table).getByRole('row', { name: /Закупки/ }))).toEqual(['0', '0', '0%']);
  });

  it('shows resolution time by category with a dash when the value is null', async () => {
    await openSummary();
    const table = await screen.findByRole('table', { name: 'Время решения по категориям' });
    expect(cells(within(table).getByRole('row', { name: /Охрана труда/ }))).toEqual(['2', '30,5ч']);
    expect(cells(within(table).getByRole('row', { name: /Обучение/ }))).toEqual(['0', '—']);
  });

  it('shows an overdue card with the count and a link to the overdue queue', async () => {
    await openSummary();
    const card = await screen.findByRole('region', { name: 'Просрочено: 3' });
    expect(within(card).getByRole('link').getAttribute('href')).toBe('/queue?overdue=1');
  });

  it('omits the new blocks when the API does not return the optional fields', async () => {
    data = { ...seeded, byDepartment: undefined, avgResolutionHoursByCategory: undefined, overdueCount: undefined };
    await openSummary();
    await screen.findByRole('region', { name: 'Всего обращений' });
    expect(screen.queryByRole('table', { name: 'Обращения по подразделениям' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Время решения по категориям' })).toBeNull();
    expect(screen.queryByText(/Просрочено:/)).toBeNull();
  });
});

describe('#130 demo reset', () => {
  it('asks for confirmation, posts /demo/reset and reloads the summary', async () => {
    const user = await openSummary();
    await screen.findByRole('region', { name: 'Всего обращений' });
    const before = summaryCalls();
    await user.click(screen.getByRole('button', { name: 'Сбросить демо' }));
    expect(resetCalls()).toBe(0);
    await user.click(await screen.findByRole('button', { name: 'Подтвердить сброс' }));
    await waitFor(() => expect(resetCalls()).toBe(1));
    await waitFor(() => expect(summaryCalls()).toBeGreaterThan(before));
    expect(await screen.findByText(/загружено 20/)).toBeTruthy();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const user = await openSummary();
    await user.click(await screen.findByRole('button', { name: 'Сбросить демо' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(resetCalls()).toBe(0);
    expect(screen.getByRole('button', { name: 'Сбросить демо' })).toBeTruthy();
  });

  it('replaces the button with "Недоступно в этой среде" on 404', async () => {
    resetStatus = 404;
    const user = await openSummary();
    await user.click(await screen.findByRole('button', { name: 'Сбросить демо' }));
    await user.click(screen.getByRole('button', { name: 'Подтвердить сброс' }));
    expect(await screen.findByText('Недоступно в этой среде')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сбросить демо' })).toBeNull();
  });

  it('shows an error and keeps the button on other failures', async () => {
    resetStatus = 500;
    const user = await openSummary();
    await user.click(await screen.findByRole('button', { name: 'Сбросить демо' }));
    await user.click(screen.getByRole('button', { name: 'Подтвердить сброс' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Сервер временно недоступен/);
    expect(screen.getByRole('button', { name: 'Сбросить демо' })).toBeTruthy();
  });
});
