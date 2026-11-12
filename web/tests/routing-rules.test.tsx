import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

// Аудит Г5: администратор видит справочник «категория → ответственный → срок» только для чтения.
const summary = { total: 0, byType: [{ type: 'problem', count: 0 }, { type: 'suggestion', count: 0 }, { type: 'praise', count: 0 }], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: '2026-11-10T10:00:00Z' };
const reference = {
  departments: [{ id: 'procurement', name: 'Закупки' }],
  categories: [{ id: 'cross_department', name: 'Межотдельное взаимодействие', assigneeId: 'manager-1', dueInDays: 7 }, { id: 'no_rule_demo', name: 'Категория без ответственного (демо)', assigneeId: null, dueInDays: 5 }],
  assignees: [{ id: 'manager-1', name: 'Руководитель закупок', role: 'manager', departmentId: 'procurement' }],
};
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/summary') return Response.json(summary);
    if (path === '/reference-data') return Response.json(reference);
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Г5 справочник маршрутов для администратора', () => {
  it('показывает ответственного, запасную очередь и срок', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
    const table = await screen.findByRole('table', { name: 'Категории и ответственные' });
    expect(within(table).getByRole('row', { name: 'Межотдельное взаимодействие Руководитель закупок 7' })).toBeTruthy();
    expect(within(table).getByRole('row', { name: 'Категория без ответственного (демо) Запасная очередь руководителя 5' })).toBeTruthy();
  });
});
