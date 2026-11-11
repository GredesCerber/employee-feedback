// #147: бейдж «Имитация» у обращений, событий и уведомлений, фильтр «Скрыть имитацию», опрос очереди раз в 10 с.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const make = (id: string, number: string, simulated: boolean) => ({ ...structuredClone(example), id, number, simulated } as Complaint);

let all: Complaint[];
let requests: URL[];
let notifications: unknown[];

beforeEach(() => {
  requests = [];
  notifications = [];
  all = [make('c-sim', 'A-501', true), make('c-real', 'A-502', false)];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    requests.push(url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/notifications') return Response.json({ items: notifications, unreadCount: notifications.length, generatedAt: '2026-11-11T00:00:00.000Z' });
    if (url.pathname === '/complaints') {
      const flag = url.searchParams.get('simulated');
      const items = all.filter(item => flag === null || String(Boolean(item.simulated)) === flag);
      return Response.json({ items, total: items.length, limit: 20, offset: 0 });
    }
    const match = /^\/complaints\/(.+)$/.exec(url.pathname);
    if (match) {
      const found = all.find(item => item.id === match[1]);
      return found ? Response.json({ ...found, history: [{ id: 'h1', type: 'created', text: 'Обращение создано', createdAt: '2026-11-10T10:00:00.000Z', actor: null, simulated: found.simulated }] }) : Response.json({}, { status: 404 });
    }
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
async function openAs(role: string, entry: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter initialEntries={[entry]}><App /></MemoryRouter>);
  await user.selectOptions(await screen.findByLabelText('Демонстрационная роль'), role);
  return user;
}
const row = (number: string) => screen.getByRole('link', { name: number }).closest('li')!;
const listQueries = () => requests.filter(url => url.pathname === '/complaints' && url.searchParams.get('limit') === '20');

describe('#147 бейдж «Имитация»', () => {
  it('в очереди бейдж с подсказкой и текстом только у simulated=true', async () => {
    await openAs('manager', '/queue');
    await screen.findByRole('link', { name: 'A-501' });
    const badge = within(row('A-501')).getByText('Имитация');
    expect(badge.closest('[title]')?.getAttribute('title')).toBe('создано демо-симулятором');
    expect(within(row('A-502')).queryByText('Имитация')).toBeNull();
  });

  it('в карточке бейдж рядом с номером и у событий истории', async () => {
    await openAs('manager', '/queue/c-sim');
    const heading = await screen.findByRole('heading', { level: 1, name: /A-501/ });
    expect(within(heading.parentElement!).getByText('Имитация')).toBeTruthy();
    const history = screen.getByRole('heading', { name: 'История обращения' }).nextElementSibling as HTMLElement;
    expect(within(history).getByText('Имитация')).toBeTruthy();
  });

  it('в карточке настоящего обращения бейджа нет', async () => {
    await openAs('manager', '/queue/c-real');
    const heading = await screen.findByRole('heading', { level: 1, name: /A-502/ });
    expect(within(heading.parentElement!).queryByText('Имитация')).toBeNull();
  });

  it('в колокольчике у уведомления simulated=true есть бейдж', async () => {
    notifications = [{ id: 'n1', kind: 'unassigned', complaintId: 'c-sim', complaintNumber: 'A-501', createdAt: '2026-11-10T10:00:00.000Z', message: 'Обращение A-501 без ответственного', href: '/queue/c-sim', simulated: true, disclaimer: 'x' }];
    const user = await openAs('manager', '/queue');
    await user.click(await screen.findByRole('button', { name: /Уведомления.*1/ }));
    const item = screen.getByRole('link', { name: /без ответственного/ }).closest('li')!;
    expect(within(item).getByText('Имитация')).toBeTruthy();
  });
});

describe('#147 фильтр «Скрыть имитацию»', () => {
  it('запрашивает simulated=false и убирает имитированные', async () => {
    const user = await openAs('manager', '/queue');
    await screen.findByRole('link', { name: 'A-501' });
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    await user.click(screen.getByLabelText('Скрыть имитацию'));
    await user.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    await screen.findByRole('link', { name: 'A-502' });
    expect(screen.queryByRole('link', { name: 'A-501' })).toBeNull();
    expect(listQueries().at(-1)!.searchParams.get('simulated')).toBe('false');
  });
});

describe('#147 опрос очереди', () => {
  it('раз в 10 с подтягивает новые обращения без индикатора загрузки и без потери ввода', async () => {
    const user = await openAs('manager', '/queue');
    await screen.findByRole('link', { name: 'A-501' });
    const input = screen.getByLabelText('Поиск по номеру или тексту') as HTMLInputElement;
    await user.click(input);
    await user.type(input, 'ab');
    const before = listQueries().length;
    all = [make('c-new', 'A-777', true), ...all];
    await tick(9_000);
    expect(listQueries().length).toBe(before);
    await tick(1_000);
    expect(listQueries().length).toBeGreaterThan(before);
    expect(screen.getByRole('link', { name: 'A-777' })).toBeTruthy();
    expect(screen.queryByText('Загрузка очереди…')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('ab');
  });
});
