// #127 (R8): колокольчик уведомлений: счётчик, список, переход, пустое состояние, опрос раз в 30 с без дублей.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

const DISCLAIMER = 'Имитация: в промышленной версии email / Битрикс24';
type Item = { id: string; kind: string; complaintId: string; complaintNumber: string; createdAt: string; message: string; href: string; simulated: true; disclaimer: string };
const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, kind: 'clarification_requested', complaintId: 'c1', complaintNumber: 'A-001', createdAt: '2026-11-10T10:00:00.000Z',
  message: 'По обращению A-001 запрошено уточнение', href: '/my/c1', simulated: true, disclaimer: DISCLAIMER, ...over,
});
const managerItem = item('n-unassigned', { kind: 'unassigned', complaintId: 'c2', complaintNumber: 'A-002', message: 'Обращение A-002 без ответственного', href: '/queue/c2' });

let feeds: Record<string, Item[]>;
let calls: URL[];

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom */ }
  calls = [];
  feeds = { 'employee-1': [item('n1')], 'manager-1': [managerItem] };
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/notifications') {
      calls.push(url);
      const since = url.searchParams.get('since');
      const items = (feeds[request.headers.get('X-Demo-User') ?? ''] ?? []).filter(entry => !since || Date.parse(entry.createdAt) > Date.parse(since));
      return Response.json({ items, unreadCount: items.length, generatedAt: '2026-11-11T00:00:00.000Z' });
    }
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const open = () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
  return user;
};
const bell = (name: RegExp | string) => screen.findByRole('button', { name });
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('#127 колокольчик уведомлений', () => {
  it('автор видит колокольчик со счётчиком и событием со ссылкой на карточку', async () => {
    const user = open();
    const button = await bell(/Уведомления.*1/);
    expect(within(button).getByText('1')).toBeTruthy();
    await user.click(button);
    const link = screen.getByRole('link', { name: /запрошено уточнение/ });
    expect(link.getAttribute('href')).toBe('/my/c1');
  });

  it('руководитель видит обращение без ответственного', async () => {
    const user = open();
    await bell(/Уведомления/);
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    const button = await bell(/Уведомления.*1/);
    await user.click(button);
    expect(screen.getByRole('link', { name: /без ответственного/ }).getAttribute('href')).toBe('/queue/c2');
    expect(screen.queryByRole('link', { name: /запрошено уточнение/ })).toBeNull();
  });

  it('при закрытии списка счётчик обнуляется, метка lastSeen сохраняется', async () => {
    const user = open();
    const button = await bell(/Уведомления.*1/);
    await user.click(button);
    await user.click(button);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Уведомления' })).toBeTruthy());
    expect(Object.values({ ...localStorage }).join(' ')).toContain('2026-11-10T10:00:00.000Z');
  });

  it('метка lastSeen переживает перезагрузку: прочитанное не считается новым', async () => {
    const first = open();
    const button = await bell(/Уведомления.*1/);
    await first.click(button);
    await first.click(button);
    cleanup();
    open();
    expect(await bell('Уведомления')).toBeTruthy();
  });

  it('работает, если localStorage недоступен', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const user = open();
    const button = await bell(/Уведомления.*1/);
    await user.click(button);
    await user.click(button);
    expect(await bell('Уведомления')).toBeTruthy();
  });

  it('раз в 30 с опрашивает GET /notifications?since= без дублей событий', async () => {
    const user = open();
    const button = await bell(/Уведомления.*1/);
    await user.click(button);
    await user.click(button);
    await bell('Уведомления');
    const before = calls.length;
    await tick(29_000);
    expect(calls.length).toBe(before);
    feeds['employee-1'] = [item('n1'), item('n2', { createdAt: '2026-11-10T11:00:00.000Z', message: 'Принято решение по A-001', kind: 'decision_recorded' })];
    await tick(1_000);
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)!.searchParams.get('since')).toBe('2026-11-10T10:00:00.000Z');
    await tick(30_000);
    await user.click(await bell(/Уведомления.*1/));
    expect(screen.getAllByRole('link', { name: /A-001/ })).toHaveLength(2);
  });

  it('повторная выдача того же события не удваивает счётчик', async () => {
    open();
    await bell(/Уведомления.*1/);
    await tick(30_000);
    await tick(30_000);
    expect(await bell(/Уведомления.*1/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Уведомления.*2/ })).toBeNull();
  });

  it('внизу списка пометка про имитацию', async () => {
    const user = open();
    await user.click(await bell(/Уведомления/));
    const panel = screen.getByRole('region', { name: 'Уведомления' });
    expect(panel.textContent).toContain(DISCLAIMER);
  });

  it('пустое состояние и пометка при отсутствии событий', async () => {
    feeds['employee-1'] = [];
    const user = open();
    const button = await bell('Уведомления');
    await user.click(button);
    expect(screen.getByText('Новых уведомлений нет')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Уведомления' }).textContent).toContain(DISCLAIMER);
  });
});
