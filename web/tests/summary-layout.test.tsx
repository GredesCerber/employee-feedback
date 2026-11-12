import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

// Вёрстка сводки: панели в двух независимых колонках (без пустот рядом с длинной таблицей), темы не дублируются таблицей на экране.
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

describe('summary layout', () => {
  it('stacks panels in two independent columns', async () => {
    await openSummary();
    const departments = await screen.findByRole('table', { name: 'Обращения по подразделениям' });
    const resolution = screen.getByRole('table', { name: 'Время решения по категориям' });
    const left = departments.closest('.summary-column');
    const right = resolution.closest('.summary-column');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left).not.toBe(right);
    expect(within(left as HTMLElement).getByRole('table', { name: 'Обращения по типам' })).toBeTruthy();
  });

  it('keeps the recurring topics table only for screen readers', async () => {
    await openSummary();
    const table = await screen.findByRole('table', { name: 'Повторяющиеся темы' });
    expect(table.closest('.visually-hidden')).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Повторяющиеся темы' }).closest('.visually-hidden')).toBeNull();
  });
});
