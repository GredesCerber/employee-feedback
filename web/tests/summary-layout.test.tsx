import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    const left = screen.getByRole('table', { name: 'Обращения по типам' }).closest('.summary-column');
    const right = resolution.closest('.summary-column');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left).not.toBe(right);
    // Слева кольцо по типам и темы, справа время решения и подразделения: колонки примерно равной высоты.
    expect(departments.closest('.summary-column')).toBe(right);
    expect(within(left as HTMLElement).getByRole('table', { name: 'Повторяющиеся темы' })).toBeTruthy();
  });

  it('keeps chart data tables only for screen readers, so the screen shows each number once', async () => {
    await openSummary();
    for (const name of ['Повторяющиеся темы', 'Обращения по типам', 'Обращения по подразделениям', 'Время решения по категориям']) {
      expect((await screen.findByRole('table', { name })).closest('.visually-hidden')).not.toBeNull();
    }
    expect(screen.queryByRole('list', { name: 'Повторяющиеся темы' })).toBeNull();
    // Время решения: столбцы только для категорий с закрытыми обращениями, значение в часах, подписи столбцов сверху.
    const resolution = screen.getByRole('img', { name: /Время решения по категориям/ });
    expect([...resolution.querySelectorAll('[data-bar]')].map(bar => bar.getAttribute('data-bar'))).toEqual(['Охрана труда']);
    expect(resolution.textContent).toMatch(/30,5\s*ч/);
    expect(resolution.closest('figure')?.querySelector('.chart-header')?.textContent).toBe('КатегорияСреднее время');
    expect(screen.getByText('Остальные категории: закрытых обращений пока нет.')).toBeTruthy();
  });

  it('shows eight department bars, then all of them behind «Показать все»', async () => {
    data.byDepartment = Array.from({ length: 10 }, (_, index) => ({ departmentId: `d${index}`, departmentName: `Отдел ${index}`, count: 10 - index, closedCount: 0, closedShare: 0 }));
    const user = await openSummary();
    const bars = () => screen.getByRole('img', { name: /Обращения по подразделениям/ }).querySelectorAll('[data-bar]');
    await screen.findByRole('img', { name: /Обращения по подразделениям/ });
    expect(bars()).toHaveLength(8);
    const panel = screen.getByRole('region', { name: 'Обращения по подразделениям' });
    await user.click(within(panel).getByRole('button', { name: 'Показать все' }));
    expect(bars()).toHaveLength(10);
    expect(within(screen.getByRole('table', { name: 'Обращения по подразделениям' })).getAllByRole('row')).toHaveLength(11);
  });

  it('collapses a panel with its heading button and remembers the choice', async () => {
    localStorage.clear();
    const user = await openSummary();
    const button = within(await screen.findByRole('heading', { name: 'Повторяющиеся темы', level: 2 })).getByRole('button', { name: 'Повторяющиеся темы' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(body.hidden).toBe(false);
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
    cleanup();
    await openSummary();
    const again = within(await screen.findByRole('heading', { name: 'Повторяющиеся темы', level: 2 })).getByRole('button');
    expect(again.getAttribute('aria-expanded')).toBe('false');
    await user.click(again);
    expect(again.getAttribute('aria-expanded')).toBe('true');
    localStorage.clear();
  });

  it('prints full tables instead of charts cut to eight rows, and shows collapsed panels on paper', () => {
    const src = existsSync(resolve('src/pages')) ? resolve('src') : resolve('web/src');
    const css = readFileSync(resolve(src, 'pages/summary.css'), 'utf8');
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/\.visually-hidden:has\(> table\)\s*\{[^}]*position: static[^}]*clip: auto/);
    expect(print).toMatch(/\.summary-chart:has\(\.bar-chart\)\s*\{\s*display: none/);
    expect(print).toMatch(/\.collapsible-body\[hidden\]\s*\{\s*display: block/);
  });
});
