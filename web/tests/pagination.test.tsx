import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const makeRecords = (count: number): Complaint[] => Array.from({ length: count }, (_, index): Complaint => ({
  ...structuredClone(example), id: `pagination-${index + 1}`, number: `P-${index + 1}`,
  status: index < 4 ? 'new' : 'in_review',
}));
let records: Complaint[];
let listQueries: URLSearchParams[];

beforeEach(() => {
  records = makeRecords(4); listQueries = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints') {
      const query = url.searchParams; listQueries.push(query);
      const filtered = records.filter(item => !query.get('status') || item.status === query.get('status'));
      const limit = Number(query.get('limit') ?? 20), offset = Number(query.get('offset') ?? 0);
      return Response.json({ items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset });
    }
    return Response.json({ code: 'NOT_FOUND', message: 'Неизвестный маршрут' }, { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openList(role: 'employee' | 'manager', entry = role === 'employee' ? '/my' : '/queue') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[entry]}><App /></MemoryRouter>);
  if (role === 'manager') {
    await screen.findByRole('heading', { level: 1, name: 'Мои обращения' });
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    await screen.findByRole('heading', { level: 1, name: 'Очередь обращений' });
  }
  return user;
}

function expectNoPagination() {
  expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();
  expect(screen.queryByText(/^Страница \d+ из \d+$/)).toBeNull();
}

describe('#198 pagination appears only for multiple pages', () => {
  it.each([0, 4, 20])('hides pagination for an employee with %i complaints', async count => {
    records = makeRecords(count);
    await openList('employee');
    await screen.findByText(count === 0 ? 'У вас пока нет обращений.' : `Всего обращений: ${count}`);
    expectNoPagination();
  });

  it.each([['new', 4], ['in_review', 20], ['closed', 0]] as const)(
    'hides pagination for a manager filter %s returning %i complaints', async (status, count) => {
      records = makeRecords(24);
      await openList('manager', `/queue?status=${status}`);
      await screen.findByText(`Найдено: ${count}`);
      expectNoPagination();
      expect(listQueries.some(query => query.get('status') === status && query.get('limit') === '20')).toBe(true);
    },
  );

  it.each(['employee', 'manager'] as const)('keeps next and previous pages functional for %s', async role => {
    records = makeRecords(21);
    const user = await openList(role);
    await screen.findByRole('link', { name: 'P-20' });
    expect(screen.getByText('Страница 1 из 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Назад' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Далее' }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByRole('link', { name: 'P-21' });
    expect(screen.queryByRole('link', { name: 'P-1' })).toBeNull();
    expect(screen.getByText('Страница 2 из 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Далее' }) as HTMLButtonElement).disabled).toBe(true);
    expect(listQueries.some(query => query.get('limit') === '20' && query.get('offset') === '20')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Назад' }));
    await screen.findByRole('link', { name: 'P-1' });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'P-21' })).toBeNull());
    expect(screen.getByText('Страница 1 из 2')).toBeTruthy();
  });
});
