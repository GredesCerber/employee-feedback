import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../src/app/session';
import { NotificationBell } from '../src/features/notifications';
import type { components } from '../src/api/client';

type Item = components['schemas']['Notification'];
type Mode = 'network' | 'server' | 'rate' | 'ok';
let mode: Mode;
let items: Item[];
let calls: number;
let gate: Promise<void> | undefined;
const entry = (id: string, hour: string): Item => ({
  id, kind: 'clarification_requested', complaintId: 'qa-261', complaintNumber: 'A-001',
  createdAt: `2026-11-10T${hour}:00:00Z`, message: `Событие ${id}`, href: '/my/qa-261',
  simulated: true, disclaimer: 'Имитация: в промышленной версии email / Битрикс24',
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'));
  localStorage.clear();
  mode = 'ok'; items = []; calls = 0; gate = undefined;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async () => {
    calls += 1;
    if (gate) await gate;
    if (mode === 'network') throw new TypeError('Failed to fetch');
    if (mode === 'server') return Response.json({ code: 'INTERNAL_ERROR', message: 'technical detail' }, { status: 500 });
    if (mode === 'rate') return Response.json({ code: 'RATE_LIMITED', message: 'limited' }, { status: 429, headers: { 'Retry-After': '60' } });
    return Response.json({ items });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
async function open() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter><SessionProvider><NotificationBell role="employee" /></SessionProvider></MemoryRouter>);
  await tick(0);
  await user.click(screen.getByRole('button', { name: /Уведомления/ }));
  return user;
}

describe('#261 notification failures and recovery', () => {
  it.each(['network', 'server'] as const)('does not claim an empty feed after %s failure; manual retry cannot overlap polling', async failure => {
    mode = failure;
    const user = await open();
    expect(screen.getByRole('alert').textContent).toMatch(/Не удалось обновить уведомления.*30 секунд/);
    expect(screen.queryByText('Новых уведомлений нет')).toBeNull();
    expect(screen.queryByText('technical detail')).toBeNull();
    mode = 'ok';
    let finish!: () => void;
    gate = new Promise<void>(resolve => { finish = resolve; });
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(screen.getByRole('status').textContent).toContain('Обновление уведомлений');
    expect(calls).toBe(2);
    await tick(30_000);
    expect(calls).toBe(2);
    finish();
    await tick(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Новых уведомлений нет')).toBeTruthy();
  });

  it('preserves events, links and count after a failed poll, then merges new events on recovery', async () => {
    items = [entry('n1', '10')];
    await open();
    expect(screen.getByRole('link', { name: 'Событие n1' }).getAttribute('href')).toBe('/my/qa-261');
    mode = 'network';
    await tick(30_000);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Событие n1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Уведомления, новых: 1' })).toBeTruthy();
    mode = 'ok'; items = [entry('n1', '10'), entry('n2', '11')];
    await tick(30_000);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('link', { name: /Событие n/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Уведомления, новых: 2' })).toBeTruthy();
  });

  it('honors Retry-After for manual and automatic retries and restarts the countdown after another 429', async () => {
    mode = 'rate';
    const user = await open();
    expect((screen.getByRole('button', { name: 'Повторить' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await tick(59_999);
    expect(calls).toBe(1);
    await tick(1);
    expect(calls).toBe(2);
    expect((screen.getByRole('button', { name: 'Повторить' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('60 с');
    await tick(59_999);
    expect(calls).toBe(2);
    mode = 'ok';
    await tick(1);
    expect(calls).toBe(3);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Новых уведомлений нет')).toBeTruthy();
  });
});
