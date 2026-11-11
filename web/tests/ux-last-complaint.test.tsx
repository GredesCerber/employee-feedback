import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LastComplaintButton } from '../src/features/LastComplaint';
import { createApiClient } from '../src/api/client';
import { readLastComplaint, saveLastComplaint, useRememberComplaint } from '../src/features/lastComplaintStore';

const state = vi.hoisted(() => ({ role: 'employee' as 'employee' | 'manager' | 'admin', get: vi.fn() }));
vi.mock('../src/app/session', () => ({ demoUsers: { employee: 'employee-1', manager: 'manager-1', admin: 'admin-1' }, useSession: () => ({ role: state.role, api: { GET: state.get } }) }));
vi.mock('../src/i18n', () => ({ useI18n: () => ({ locale: 'ru' }) }));
function Remember({ id }: { id: string }) { useRememberComplaint(id); return null; }
function View() { return <MemoryRouter initialEntries={['/']}><LastComplaintButton /><Routes><Route path="/my/:id" element={<p>employee card</p>} /><Route path="/queue/:id" element={<p>manager card</p>} /></Routes></MemoryRouter>; }
beforeEach(() => { localStorage.clear(); state.role = 'employee'; state.get.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('last complaint', () => {
  it('stores valid identifiers scoped by role and user', () => {
    const { rerender } = render(<Remember id="card_1" />);
    rerender(<Remember id="bad/id" />);
    expect(readLastComplaint('employee')).toBe('card_1');
    state.role = 'manager'; rerender(<Remember id="manager-2" />);
    expect(readLastComplaint('manager')).toBe('manager-2');
    expect(readLastComplaint('employee')).toBe('card_1');
  });
  it.each(['employee', 'manager'] as const)('checks access before navigating for %s', async role => {
    state.role = role; saveLastComplaint(role, 'c1');
    state.get.mockResolvedValue({ response: { ok: true, status: 200 }, data: { id: 'c1' } });
    render(<View />); fireEvent.click(screen.getByRole('button'));
    expect(state.get).toHaveBeenCalledWith('/complaints/{complaintId}', { params: { path: { complaintId: 'c1' } } });
    expect(await screen.findByText(role === 'employee' ? 'employee card' : 'manager card')).toBeTruthy();
  });
  it.each([403, 404])('clears an unavailable pointer for %s', async status => {
    saveLastComplaint('employee', 'c1'); state.get.mockResolvedValue({ response: { ok: false, status } });
    render(<View />); fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toContain('Обращение недоступно');
    expect(readLastComplaint('employee')).toBeNull();
  });
  it.each([403, 404])('handles real client HTTP %s errors without exposing server details', async status => {
    saveLastComplaint('employee', 'c1');
    const fetch = vi.fn(async () => Response.json({ code: 'DENIED', message: 'private details' }, { status }));
    const client = createApiClient({ userId: 'employee-1', baseUrl: 'http://localhost:3000', fetch });
    state.get.mockImplementation(() => client.GET('/complaints/{complaintId}', { params: { path: { complaintId: 'c1' } } }));
    render(<View />); fireEvent.click(screen.getByRole('button'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Обращение недоступно');
    expect(alert.textContent).not.toContain('private details');
    expect(readLastComplaint('employee')).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps the pointer and allows retry after a network error', async () => {
    saveLastComplaint('employee', 'c1'); state.get.mockRejectedValue(new Error('offline'));
    render(<View />); fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(readLastComplaint('employee')).toBe('c1');
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
  it('retains the pointer in memory when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    saveLastComplaint('employee', 'offline-card');
    state.get.mockResolvedValue({ response: { ok: true, status: 200 }, data: { id: 'offline-card' } });
    render(<View />); fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('employee card')).toBeTruthy();
  });
});
