import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

type Summary = components['schemas']['Summary'];
const seeded: Summary = { total: 20, byType: [{ type: 'problem', count: 13 }, { type: 'suggestion', count: 5 }, { type: 'praise', count: 2 }], closedCount: 5, closedShare: 0.25, averageFirstResponseHours: 2.5, respondedCount: 8, recurringTopics: [{ categoryId: 'cross_department', categoryName: 'Межотдельное взаимодействие', count: 3 }, { categoryId: 'training', categoryName: 'Обучение', count: 2 }], generatedAt: '2026-11-10T10:00:00Z' };
let data: Summary;
let failure: boolean;
let requests: Request[];
beforeEach(() => {
  data = structuredClone(seeded); failure = false; requests = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(request.clone());
    if (new URL(request.url).pathname === '/summary') return failure
      ? Response.json({ code: 'INTERNAL_ERROR', message: 'Не удалось получить сводку' }, { status: 500 }) : Response.json(data);
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function openSummary() {
  const user = userEvent.setup(); render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
  return user;
}

describe('administrator summary', () => {
  it('renders type counts, a percentage and first-response time from the API as admin', async () => {
    await openSummary();
    const total = await screen.findByRole('region', { name: 'Всего обращений' });
    expect(within(total).getByText('20')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Доля закрытых' })).getByText(/25\s*%/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Среднее время первого ответа' })).getByText(/2,5\s*ч/)).toBeTruthy();
    const types = screen.getByRole('table', { name: 'Обращения по типам' });
    expect(within(types).getByRole('row', { name: 'Проблема 13' })).toBeTruthy();
    expect(within(types).getByRole('row', { name: 'Предложение 5' })).toBeTruthy();
    expect(within(types).getByRole('row', { name: 'Благодарность 2' })).toBeTruthy();
    expect(requests.find(request => request.url.endsWith('/summary'))?.headers.get('X-Demo-User')).toBe('admin-1');
  });

  it('lists recurring categories with their complaint counts', async () => {
    await openSummary();
    const topics = await screen.findByRole('table', { name: 'Повторяющиеся темы' });
    expect(within(topics).getByRole('row', { name: 'Межотдельное взаимодействие 3' })).toBeTruthy();
    expect(within(topics).getByRole('row', { name: 'Обучение 2' })).toBeTruthy();
  });

  it('distinguishes an empty dataset and absent response time from zero hours', async () => {
    data = { ...seeded, total: 0, byType: seeded.byType.map(item => ({ ...item, count: 0 })), closedCount: 0, closedShare: 0, respondedCount: 0, averageFirstResponseHours: null, recurringTopics: [] };
    await openSummary();
    expect(await screen.findByText('Нет ответов')).toBeTruthy();
    expect(screen.getByText('Повторяющихся тем пока нет.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Доля закрытых' })).getByText(/0\s*%/)).toBeTruthy();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it('reports failure without fictitious totals and supports retry', async () => {
    failure = true; const user = await openSummary();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Всего обращений' })).toBeNull();
    failure = false;
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('region', { name: 'Всего обращений' })).toBeTruthy();
  });
});
