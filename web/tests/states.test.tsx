import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

// #114: загрузка дольше 300 мс, 5xx и сеть с «Повторить», 429 с Retry-After, пустые состояния.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const summary = { total: 1, byType: [{ type: 'problem', count: 1 }, { type: 'suggestion', count: 0 }, { type: 'praise', count: 0 }], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: '2026-11-10T10:00:00Z' };

type Mode = 'ok' | 'hang' | 'server' | 'network' | 'empty' | 'rate';
let mode: Record<string, Mode>;
let calls: Record<string, number>;

function key(url: URL, method: string) {
  if (method === 'POST' && url.pathname === '/complaints') return 'create';
  if (url.pathname === '/complaints') return 'list';
  if (url.pathname.startsWith('/complaints/')) return 'card';
  return url.pathname.slice(1);
}

beforeEach(() => {
  mode = {}; calls = {};
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    const name = key(url, request.method);
    calls[name] = (calls[name] ?? 0) + 1;
    const current = mode[name] ?? 'ok';
    if (current === 'hang') return new Promise<Response>(() => {});
    if (current === 'network') throw new TypeError('Failed to fetch');
    if (current === 'server') return Response.json({ code: 'INTERNAL_ERROR', message: 'Internal Server Error' }, { status: 503 });
    if (current === 'rate') return Response.json({ code: 'RATE_LIMITED', message: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': '2' } });
    if (name === 'reference-data') return Response.json(reference);
    if (name === 'summary') return Response.json(summary);
    if (name === 'list') return Response.json(current === 'empty' ? { items: [], total: 0, limit: 20, offset: 0 } : { items: [example], total: 1, limit: 20, offset: 0 });
    return Response.json(example, { status: request.method === 'POST' ? 201 : 200 });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function open(path: string, role: 'employee' | 'manager' | 'admin' = 'employee') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[role === 'employee' ? path : '/']}><App /></MemoryRouter>);
  if (role !== 'employee') await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  return user;
}

describe('#114 loading indicator', () => {
  const screens: [string, string, 'employee' | 'manager' | 'admin', string][] = [
    ['Новое обращение', '/submit', 'employee', 'reference-data'],
    ['Мои обращения', '/my', 'employee', 'list'],
    ['Карточка обращения', `/my/${example.id}`, 'employee', 'card'],
    ['Очередь', '/queue', 'manager', 'list'],
    ['Сводка', '/summary', 'admin', 'summary'],
  ];
  for (const [title, path, role, resource] of screens) {
    it(`${title}: indicator appears when the request takes longer than 300 ms`, async () => {
      mode[resource] = 'hang';
      await open(path, role);
      const indicator = await screen.findByRole('status', {}, { timeout: 1500 });
      expect(indicator.textContent).toMatch(/Загрузка/);
      expect(indicator.querySelector('.spinner')).toBeTruthy();
    });
  }

  it('does not flash the indicator for fast responses', async () => {
    mode.list = 'hang';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.queryByText(/Загрузка обращений/)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByText(/Загрузка обращений/)).toBeTruthy();
  });
});

describe('#114 server and network errors', () => {
  it('shows a Russian message for 5xx and «Повторить» repeats the request', async () => {
    mode.list = 'server';
    const user = await open('/my');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Сервер временно недоступен/);
    expect(alert.textContent).not.toMatch(/Internal Server Error/);
    const before = calls.list!;
    mode.list = 'ok';
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('link', { name: example.number })).toBeTruthy();
    expect(calls.list).toBe(before + 1);
  });

  it('shows a Russian message when the network is down and retries', async () => {
    mode.summary = 'network';
    const user = await open('/summary', 'admin');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Нет связи с сервером/);
    mode.summary = 'ok';
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('region', { name: 'Всего обращений' })).toBeTruthy();
  });
});

describe('#114 rate limit 429 with Retry-After', () => {
  it('tells how long to wait and blocks the action button for that time', async () => {
    mode.create = 'rate';
    const user = await open('/submit');
    await user.selectOptions(await screen.findByLabelText('Категория'), 'cross_department');
    await user.type(screen.getByLabelText('Описание'), 'Тест лимита');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Слишком много запросов, повторите через [12] с/);
    const button = screen.getByRole('button', { name: /Отправить обращение/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await waitFor(() => expect(button.disabled).toBe(false), { timeout: 3500 });
  });

  it('blocks «Повторить» on a list that was rate limited until the wait is over', async () => {
    mode.list = 'rate';
    await open('/my');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Слишком много запросов, повторите через [12] с/);
    const retry = screen.getByRole('button', { name: 'Повторить' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    await waitFor(() => expect(retry.disabled).toBe(false), { timeout: 3500 });
  });
});

describe('#114 empty states with a next step', () => {
  it('employee without complaints is offered to submit the first one', async () => {
    mode.list = 'empty';
    await open('/my');
    expect(await screen.findByText('У вас пока нет обращений.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Подать первое обращение' })).toBeTruthy();
  });

  it('empty queue explains what to do next', async () => {
    mode.list = 'empty';
    await open('/queue', 'manager');
    expect(await screen.findByText('По выбранным фильтрам обращений нет.')).toBeTruthy();
    expect(screen.getByText(/Измените условия или нажмите «Сбросить»/)).toBeTruthy();
  });
});
