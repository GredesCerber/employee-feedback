import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

// #111: графики сводки на SVG без библиотек, карточки, повторяющиеся темы, пустое состояние, доступность.
type Summary = components['schemas']['Summary'];
const seeded: Summary = {
  total: 20,
  byType: [{ type: 'problem', count: 9 }, { type: 'suggestion', count: 10 }, { type: 'praise', count: 1 }],
  closedCount: 4, closedShare: 0.2, averageFirstResponseHours: 9.6, respondedCount: 5,
  recurringTopics: [
    { categoryId: 'cross_department', categoryName: 'Межотдельное взаимодействие', count: 3 },
    { categoryId: 'training', categoryName: 'Обучение', count: 2 },
  ],
  generatedAt: '2026-11-10T10:00:00Z',
};
const empty: Summary = {
  ...seeded, total: 0, byType: seeded.byType.map(item => ({ ...item, count: 0 })),
  closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [],
};
let data: Summary;
beforeEach(() => {
  data = structuredClone(seeded);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => new URL(request.url).pathname === '/summary'
    ? Response.json(data) : Response.json({ items: [], total: 0, limit: 20, offset: 0 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openSummary() {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
  await screen.findByRole('heading', { name: 'Сводка', level: 1 });
}

describe('#111 summary charts', () => {
  it('draws an SVG donut by type: one arc per type, proportional, total in the centre', async () => {
    await openSummary();
    const chart = await screen.findByRole('img', { name: /Обращения по типам/ });
    expect(chart.tagName.toLowerCase()).toBe('svg');
    expect(chart.querySelector('title')?.textContent).toBe('Обращения по типам: Проблема 9, Предложение 10, Благодарность 1');
    const arcs = [...chart.querySelectorAll('[data-slice]')];
    expect(arcs.map(arc => arc.getAttribute('data-slice'))).toEqual(['problem', 'suggestion', 'praise']);
    const lengths = arcs.map(arc => Number(arc.getAttribute('stroke-dasharray')?.split(' ')[0]));
    expect(lengths.every(Number.isFinite)).toBe(true);
    expect(Math.max(...lengths)).toBe(lengths[1]);
    expect(lengths.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(100);
    expect(chart.textContent).toContain('20');
    const legend = chart.parentElement!.querySelector('.donut-legend')!;
    expect(legend.getAttribute('aria-hidden')).toBe('true');
    expect(legend.textContent).toMatch(/Предложение10\s*50\s*%/);
  });

  it('draws an SVG bar chart by category for recurring topics', async () => {
    await openSummary();
    const chart = await screen.findByRole('img', { name: /по категориям/ });
    expect(chart.querySelector('[data-bar="Межотдельное взаимодействие"]')?.textContent).toContain('3');
    expect(chart.querySelector('[data-bar="Обучение"]')?.textContent).toContain('2');
  });

  it('keeps a text table alternative next to each chart for screen readers', async () => {
    await openSummary();
    const types = await screen.findByRole('table', { name: 'Обращения по типам' });
    expect(within(types).getByRole('row', { name: 'Предложение 10' })).toBeTruthy();
    const topics = screen.getByRole('table', { name: 'Повторяющиеся темы' });
    expect(within(topics).getByRole('row', { name: 'Обучение 2' })).toBeTruthy();
  });

  it('shows share of closed and first-response time as large cards with units', async () => {
    await openSummary();
    expect(within(await screen.findByRole('region', { name: 'Доля закрытых' })).getByText(/20\s*%/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Среднее время первого ответа' })).getByText(/9,6\s*ч/)).toBeTruthy();
  });

  it('shows recurring topics only as a chart with column labels and one queue hint for the administrator', async () => {
    await openSummary();
    const panel = await screen.findByRole('region', { name: 'Повторяющиеся темы' });
    expect(within(panel).queryByRole('list')).toBeNull();
    expect(within(panel).getAllByText('Очередь доступна руководителю')).toHaveLength(1);
    const header = panel.querySelector('.chart-header')!;
    expect(header.textContent).toBe('КатегорияКоличество');
    expect(header.nextElementSibling?.querySelector('svg[role="img"]')).toBeTruthy();
  });

  it('shows an empty state without charts and without division by zero', async () => {
    data = structuredClone(empty);
    await openSummary();
    expect(await screen.findByText('Обращений пока нет — диаграммы появятся после первой подачи.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Обращения по типам/ })).toBeNull();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

