import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

let item: Complaint;
let conflict: string;
let undoCalls: number;
beforeEach(() => {
  conflict = ''; undoCalls = 0;
  item = { id: 'cmp-1', number: 'A-001', type: 'problem', categoryId: 'training', departmentId: 'procurement',
    author: { id: 'employee-1', name: 'Сотрудник', role: 'employee', departmentId: 'procurement' },
    description: 'Нужны занятия', proposedSolution: null, priority: 'medium', attachments: [], status: 'in_review', assignee: null,
    routing: { queue: 'unassigned', reason: 'no_rule' }, createdAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-11T09:00:00Z',
    dueAt: '2026-11-20T09:00:00Z', firstResponseAt: null, closedAt: null, overdue: false, comments: [], history: [], decision: null,
    nextAction: 'Рассмотреть обращение', canUndo: true, undoExpiresAt: new Date(Date.now() + 3000).toISOString() };
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/reference-data') return Response.json({ categories: [], departments: [], assignees: [] });
    if (path.endsWith('/undo')) {
      undoCalls += 1;
      if (conflict) return Response.json({ code: conflict, message: 'conflict' }, { status: 409 });
      item = { ...item, canUndo: false, undoExpiresAt: null, status: 'new', history: [{ id: 'undone-1', kind: 'undone', actor: null,
        createdAt: new Date().toISOString(), fromStatus: 'in_review', toStatus: 'new', text: 'Руководитель отменил последнее действие.' }] };
      return Response.json(item);
    }
    if (path === '/complaints/cmp-1') return Response.json(item);
    return Response.json({ items: [], unreadCount: 0 });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function openCard(manager = true) {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[manager ? '/queue/cmp-1' : '/my/cmp-1']}><App /></MemoryRouter>);
  if (manager) await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByRole('heading', { name: 'Обращение A-001' });
  return user;
}

it('#125 shows remaining time and refreshes the card, history and visible confirmation after undo', async () => {
  const user = await openCard();
  expect(screen.getByText(/Осталось для отмены:/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Отменить действие' }));
  expect(await screen.findByText('Руководитель отменил последнее действие.')).toBeTruthy();
  const notice = await screen.findByText('Последнее действие отменено.');
  expect(notice.className).not.toContain('visually-hidden');
  expect(screen.queryByRole('button', { name: 'Отменить действие' })).toBeNull();
  expect(undoCalls).toBe(1);
});

it('#125 removes the action when its window expires', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await openCard();
  expect(screen.getByRole('button', { name: 'Отменить действие' })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(screen.queryByRole('button', { name: 'Отменить действие' })).toBeNull();
  expect(undoCalls).toBe(0);
});

for (const code of ['UNDO_EXPIRED', 'NOTHING_TO_UNDO']) {
  it(`#125 explains ${code} and hides the unavailable action`, async () => {
    conflict = code;
    const user = await openCard();
    await user.click(screen.getByRole('button', { name: 'Отменить действие' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Отменить действие' })).toBeNull());
    expect(screen.getByRole('alert').textContent).toMatch(code === 'UNDO_EXPIRED' ? /Время отмены истекло/ : /Нет доступного действия/);
  });
}

it('#125 never offers undo to an employee, even if the fixture contains canUndo', async () => {
  await openCard(false);
  expect(screen.queryByRole('button', { name: 'Отменить действие' })).toBeNull();
});
