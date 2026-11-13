import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SummaryPage from '../src/pages/SummaryPage';

const state = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'manager', locale: 'ru' as 'ru' | 'en' | 'kk' }));
const summary = { total: 3, byType: [{ type: 'problem', count: 3 }], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [{ categoryId: 'safety', categoryName: 'Безопасность', count: 3 }], overdueCount: 2, generatedAt: '2026-11-10T10:00:00Z' };
const api = { GET: async () => ({ data: summary }) };
vi.mock('../src/app/session', () => ({ useSession: () => ({ role: state.role, api }) }));
vi.mock('../src/i18n', async importOriginal => ({ ...(await importOriginal<typeof import('../src/i18n')>()), useI18n: () => ({ locale: state.locale, t: (key: string) => key }) }));
const open = () => render(<MemoryRouter><SummaryPage /></MemoryRouter>);
beforeEach(() => { state.role = 'admin'; state.locale = 'ru'; });
afterEach(cleanup);

describe('#282 summary queue access', () => {
  it.each([
    ['ru', 'Очередь доступна руководителю'],
    ['en', 'The queue is available to managers'],
    ['kk', 'Кезек басшыға қолжетімді'],
  ] as const)('shows a localized explanation instead of inaccessible admin links (%s)', async (locale, hint) => {
    state.locale = locale; open();
    const overdue = await screen.findByRole('region', { name: /Просрочено/ });
    const topic = screen.getByRole('region', { name: 'Повторяющиеся темы' });
    expect(within(overdue).queryByRole('link')).toBeNull();
    expect(within(topic).queryByRole('link')).toBeNull();
    expect(within(overdue).getByText(hint)).toBeTruthy();
    expect(within(topic).getByText(hint)).toBeTruthy();
  });
  it('keeps the existing filtered links for a manager', async () => {
    state.role = 'manager'; open();
    expect((await screen.findByRole('link', { name: 'Открыть просроченные в очереди' })).getAttribute('href')).toBe('/queue?overdue=1');
    const links = screen.getByRole('list', { name: 'Открыть в очереди' });
    expect(within(links).getByRole('link', { name: 'Безопасность' }).getAttribute('href')).toBe('/queue?categoryId=safety');
    expect(screen.queryByText('Очередь доступна руководителю')).toBeNull();
  });
});

