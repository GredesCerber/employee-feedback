import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';
import { mySortFromUrl, myStateToUrl, sortMyComplaints } from '../src/features/myComplaintsFilters';

// #312 B3: сортировка «Моих обращений» по дате подачи и по сроку без изменения контракта.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 9)).toISOString();
const make = (number: string, created: number, due: number, status: Complaint['status'] = 'new'): Complaint =>
  ({ ...structuredClone(example), id: `s-${number}`, number, status, createdAt: day(created), dueAt: day(due), description: `Обращение ${number}` });

let records: Complaint[];
let listQueries: URLSearchParams[];
let location = '';

function LocationProbe() {
  const current = useLocation();
  location = current.pathname + current.search;
  return null;
}

beforeEach(() => {
  listQueries = []; location = '';
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(contract.components.schemas.ReferenceData.examples[0]);
    if (url.pathname === '/complaints') {
      const query = url.searchParams; listQueries.push(query);
      const limit = Number(query.get('limit') ?? 20), offset = Number(query.get('offset') ?? 0);
      // Порядок контракта: createdAt по убыванию, затем id.
      const ordered = sortMyComplaints(records.filter(item => !query.get('status') || item.status === query.get('status')), 'new');
      return Response.json({ items: ordered.slice(offset, offset + limit), total: ordered.length, limit, offset });
    }
    return Response.json({ code: 'NOT_FOUND', message: 'Неизвестный маршрут' }, { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function open(entry = '/my') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[entry]}><App /><LocationProbe /></MemoryRouter>);
  return user;
}
const shown = () => [...document.querySelectorAll('.complaint-list .complaint-number')].map(link => link.textContent);

describe('#312 B3 sort helpers', () => {
  it('reads and writes sort in the URL, default stays out of it', () => {
    expect(mySortFromUrl(new URLSearchParams('sort=due'))).toBe('due');
    expect(mySortFromUrl(new URLSearchParams('sort=old'))).toBe('old');
    expect(mySortFromUrl(new URLSearchParams('sort=bogus'))).toBe('new');
    expect(myStateToUrl({ status: 'new', q: '' }, 'due').toString()).toBe('status=new&sort=due');
    expect(myStateToUrl({ status: '', q: '' }, 'new').toString()).toBe('');
  });

  it('orders by date both ways and by deadline with finished complaints last', () => {
    const items = [make('A', 1, 9), make('B', 3, 5), make('C', 2, 4, 'closed'), make('D', 5, 6)];
    expect(sortMyComplaints(items, 'new').map(item => item.number)).toEqual(['D', 'B', 'C', 'A']);
    expect(sortMyComplaints(items, 'old').map(item => item.number)).toEqual(['A', 'C', 'B', 'D']);
    expect(sortMyComplaints(items, 'due').map(item => item.number)).toEqual(['B', 'D', 'A', 'C']);
    expect(items.map(item => item.number)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('#312 B3 sort in «Мои обращения»', () => {
  it('sorts by deadline from the select and keeps it in the URL', async () => {
    records = [make('M-1', 1, 9), make('M-2', 2, 3), make('M-3', 3, 6), make('M-4', 4, 2, 'closed')];
    const user = open();
    await screen.findByText('Всего обращений: 4');
    expect(shown()).toEqual(['M-4', 'M-3', 'M-2', 'M-1']);
    await user.selectOptions(screen.getByLabelText('Сортировка'), 'due');
    await screen.findByText('Всего обращений: 4');
    expect(location).toBe('/my?sort=due');
    expect(shown()).toEqual(['M-2', 'M-3', 'M-1', 'M-4']);
    await user.selectOptions(screen.getByLabelText('Сортировка'), 'old');
    expect(location).toBe('/my?sort=old');
    await vi.waitFor(() => expect(shown()).toEqual(['M-1', 'M-2', 'M-3', 'M-4']));
  });

  it('sorts across all pages, not only inside the current one', async () => {
    // 130 обращений: сервер отдаёт по 100, срок у самых старых — ближайший.
    records = Array.from({ length: 130 }, (_, index) => make(`N-${String(index).padStart(3, '0')}`, index, 200 + index));
    const user = open('/my?sort=due');
    await screen.findByText('Всего обращений: 130');
    expect(listQueries.filter(query => query.get('limit') === '100').map(query => query.get('offset'))).toEqual(['0', '100']);
    expect(shown()).toHaveLength(20);
    expect(shown()[0]).toBe('N-000');
    expect(screen.getByText(/из 7/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(shown()[0]).toBe('N-020');
    expect(location).toBe('/my?sort=due');
  });

  it('keeps the chosen sort when the status filter changes', async () => {
    records = [make('M-1', 1, 9), make('M-2', 2, 3), make('M-3', 3, 6, 'closed')];
    const user = open('/my?sort=old');
    await screen.findByText('Всего обращений: 3');
    expect((screen.getByLabelText('Сортировка') as HTMLSelectElement).value).toBe('old');
    await user.selectOptions(screen.getByLabelText('Статус'), 'new');
    await screen.findByText('Найдено: 2');
    expect(location).toBe('/my?status=new&sort=old');
    expect(shown()).toEqual(['M-1', 'M-2']);
  });
});
