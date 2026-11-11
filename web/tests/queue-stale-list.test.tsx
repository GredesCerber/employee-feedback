import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

// Регрессия: после «Применить фильтры» старый список не должен оставаться на экране, пока грузится новый
// (E2E демо-пути, шаг 5, читал старые строки как результат фильтра «Только просроченные»).
const reference = { categories: [{ id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: 'manager-1' }], departments: [{ id: 'procurement', name: 'Закупки' }], assignees: [] };
const item = (number: string, overdue: boolean) => ({
  id: `id-${number}`, number, type: 'problem', categoryId: 'cross_department', departmentId: 'procurement', description: `Обращение ${number}`,
  status: 'in_review', overdue, dueAt: '2026-11-08T09:00:00Z', createdAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z',
  author: { id: 'employee-1', name: 'Сотрудник', role: 'employee', departmentId: 'procurement' }, assignee: null,
  routing: { queue: 'unassigned', reason: 'no_rule' }, nextAction: '', comments: [], history: [], attachments: [], decision: null, proposedSolution: null, firstResponseAt: null,
});
let releaseFiltered: () => void;

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints' && url.searchParams.get('overdue') === 'true') {
      await new Promise<void>(resolve => { releaseFiltered = resolve; });
      return Response.json({ items: [item('A-001', true)], total: 1, limit: 20, offset: 0 });
    }
    return Response.json({ items: [item('A-099', false), item('A-001', true)], total: 2, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('queue: no stale rows after applying filters', () => {
  it('hides the previous list immediately and shows only the new result', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    expect(await screen.findByRole('link', { name: 'A-099' })).toBeTruthy();
    await user.click(screen.getByLabelText('Только просроченные'));
    await user.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    expect(screen.queryByRole('link', { name: 'A-099' })).toBeNull();
    expect(screen.queryByText(/^Найдено:/)).toBeNull();
    releaseFiltered();
    expect(await screen.findByRole('link', { name: 'A-001' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'A-099' })).toBeNull();
    expect(screen.getByText('Найдено: 1')).toBeTruthy();
  });
});
