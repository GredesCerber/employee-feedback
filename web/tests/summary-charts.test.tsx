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
  it('draws an SVG bar chart by type with a label and number on every bar', async () => {
    await openSummary();
    const chart = await screen.findByRole('img', { name: /Обращения по типам/ });
    expect(chart.tagName.toLowerCase()).toBe('svg');
    const bars = chart.querySelectorAll('[data-bar]');
    expect(bars).toHaveLength(3);
    for (const [label, value] of [['Проблема', '9'], ['Предложение', '10'], ['Благодарность', '1']]) {
      const bar = chart.querySelector(`[data-bar="${label}"]`);
      expect(bar?.textContent).toContain(label);
      expect(bar?.textContent).toContain(value);
    }
    const heights = [...bars].map(bar => Number(bar.querySelector('rect')?.getAttribute('width')));
    expect(heights.every(Number.isFinite)).toBe(true);
    expect(Math.max(...heights)).toBe(heights[1]);
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

  it('lists recurring topics as "повторяется N раз" with a link to the queue filtered by category', async () => {
    await openSummary();
    const list = await screen.findByRole('list', { name: 'Повторяющиеся темы' });
    const item = within(list).getByText(/Межотдельное взаимодействие/).closest('li')!;
    expect(item.textContent).toMatch(/повторяется 3 раза/);
    expect(within(item).getByRole('link').getAttribute('href')).toBe('/queue?categoryId=cross_department');
    expect(within(list).getByText(/Обучение/).closest('li')!.textContent).toMatch(/повторяется 2 раза/);
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
