import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../src/app/session';
import MyComplaintsPage from '../src/pages/MyComplaintsPage';
import ComplaintPage from '../src/pages/ComplaintPage';
import {
  forgetLastComplaint, LAST_COMPLAINT_KEY, lastComplaintPath, readLastComplaint, rememberLastComplaint,
} from '../src/features/lastComplaint';

let calls: string[];
let complaintStatus: number;

beforeEach(() => {
  localStorage.clear();
  calls = [];
  complaintStatus = 200;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.includes('/reference-data')) return Response.json({ departments: [], categories: [], assignees: [] });
    if (url.match(/\/complaints\/[^/?]+(\?|$)/)) {
      if (complaintStatus !== 200) return Response.json({ code: 'NOT_FOUND', message: 'Обращение не найдено.' }, { status: complaintStatus });
      return Response.json(complaint('c-1'));
    }
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); sessionStorage.clear(); });

function complaint(id: string) {
  return {
    id, number: 'A-001', type: 'problem', categoryId: 'c', departmentId: 'd', description: 'Текст, который не должен сохраняться',
    proposedSolution: null, priority: 'medium', attachments: [], status: 'new', assignee: null,
    routing: { queue: 'unassigned', reason: 'no_rule' }, createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z',
    dueAt: '2026-11-20T10:00:00Z', firstResponseAt: null, closedAt: null, overdue: false, comments: [], history: [],
    decision: null, nextAction: 'Ожидается назначение.', author: { id: 'employee-1', name: 'Сотрудник', role: 'employee', departmentId: 'd' },
  };
}

describe('UX-04 storage of the last opened complaint', () => {
  it('remembers only the id for the same user and role', () => {
    rememberLastComplaint('employee', 'c-1');
    expect(readLastComplaint('employee')).toBe('c-1');
    expect(readLastComplaint('manager')).toBeNull();
    expect(localStorage.getItem(LAST_COMPLAINT_KEY)).not.toContain('Текст');
  });

  it('keeps employee and manager pointers apart', () => {
    rememberLastComplaint('employee', 'c-1');
    rememberLastComplaint('manager', 'c-2');
    expect(readLastComplaint('employee')).toBe('c-1');
    expect(readLastComplaint('manager')).toBe('c-2');
  });

  it('a corrupted JSON value is treated as empty and does not throw', () => {
    localStorage.setItem(LAST_COMPLAINT_KEY, '{not json');
    expect(readLastComplaint('employee')).toBeNull();
    expect(() => rememberLastComplaint('employee', 'c-3')).not.toThrow();
    expect(readLastComplaint('employee')).toBe('c-3');
  });

  it('works from session memory when localStorage throws', () => {
    const spies = [
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); }),
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); }),
    ];
    try {
      expect(() => rememberLastComplaint('employee', 'c-9')).not.toThrow();
      expect(readLastComplaint('employee')).toBe('c-9');
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it('forget with an id clears only a matching pointer', () => {
    rememberLastComplaint('employee', 'c-1');
    forgetLastComplaint('employee', 'other');
    expect(readLastComplaint('employee')).toBe('c-1');
    forgetLastComplaint('employee', 'c-1');
    expect(readLastComplaint('employee')).toBeNull();
  });

  it('builds the card path for the role', () => {
    expect(lastComplaintPath('employee', 'c-1')).toBe('/my/c-1');
    expect(lastComplaintPath('manager', 'c-1')).toBe('/queue/c-1');
  });
});

describe('UX-04 list and card integration', () => {
  it('shows the return link on the list only when a pointer exists', async () => {
    const { unmount } = render(<MemoryRouter><SessionProvider><MyComplaintsPage /></SessionProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('У вас пока нет обращений.')).toBeTruthy());
    expect(screen.queryByRole('link', { name: 'Вернуться к последнему обращению' })).toBeNull();
    unmount();

    rememberLastComplaint('employee', 'c-1');
    render(<MemoryRouter><SessionProvider><MyComplaintsPage /></SessionProvider></MemoryRouter>);
    const link = await screen.findByRole('link', { name: 'Вернуться к последнему обращению' });
    expect(link.getAttribute('href')).toBe('/my/c-1');
  });

  it('remembers a complaint after its card loads successfully', async () => {
    render(<MemoryRouter initialEntries={['/my/c-1']}><SessionProvider><Routes><Route path="/my/:complaintId" element={<ComplaintPage />} /></Routes></SessionProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Обращение A-001' });
    expect(readLastComplaint('employee')).toBe('c-1');
  });

  it('clears the pointer when the card answers 404, and keeps it on another complaint', async () => {
    rememberLastComplaint('employee', 'c-1');
    complaintStatus = 404;
    render(<MemoryRouter initialEntries={['/my/c-1']}><SessionProvider><Routes><Route path="/my/:complaintId" element={<ComplaintPage />} /></Routes></SessionProvider></MemoryRouter>);
    await screen.findByText('Обращение недоступно');
    expect(readLastComplaint('employee')).toBeNull();
  });
});
