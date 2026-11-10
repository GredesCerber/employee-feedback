import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

// #115: фильтры очереди в адресной строке, «Сбросить», счётчик «Найдено: N из M», мусор в query.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const all: Complaint[] = [
  { ...structuredClone(example), status: 'in_review' },
  { ...structuredClone(example), id: 'complaint-other', number: 'A-999', categoryId: 'no_rule_demo', status: 'in_progress' },
  { ...structuredClone(example), id: 'complaint-third', number: 'A-998', categoryId: 'no_rule_demo', status: 'new' },
];
let requests: URL[];

beforeEach(() => {
  requests = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    requests.push(url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints') {
      const p = url.searchParams;
      const items = all.filter(item => (!p.get('departmentId') || item.departmentId === p.get('departmentId'))
        && (!p.get('categoryId') || item.categoryId === p.get('categoryId'))
        && (!p.get('status') || item.status === p.get('status')));
      const limit = Number(p.get('limit') ?? 20);
      return Response.json({ items: items.slice(0, limit), total: items.length, limit, offset: 0 });
    }
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
function renderAt(entry: string) {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[entry]}><App /><LocationProbe /></MemoryRouter>);
  return user;
}
/** Открыть ссылку на очередь: демо стартует у сотрудника, после выбора роли «Руководитель» открывается запрошенный адрес. */
async function openLink(entry: string) {
  const user = renderAt(entry);
  await screen.findByRole('heading', { level: 1, name: 'Мои обращения' });
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(entry));
  return user;
}
const lastListQuery = () => requests.filter(url => url.pathname === '/complaints' && url.searchParams.get('limit') !== '1').at(-1)!.searchParams;
const search = () => new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1] ?? '');

describe('#115 queue filters in the address bar', () => {
  it('writes applied filters into the query string', async () => {
    const user = renderAt('/');
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    await screen.findByRole('link', { name: 'A-999' });
    await user.selectOptions(screen.getByLabelText('Подразделение'), 'procurement');
    await user.selectOptions(screen.getByLabelText('Категория'), 'no_rule_demo');
    await user.selectOptions(screen.getByLabelText('Статус'), 'in_progress');
    await user.type(screen.getByLabelText('Срок до'), '2026-11-20');
    await user.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    await waitFor(() => expect(search().get('departmentId')).toBe('procurement'));
    expect(search().get('categoryId')).toBe('no_rule_demo');
    expect(search().get('status')).toBe('in_progress');
    expect(search().get('dueBefore')).toBe('2026-11-20');
  });

  it('opens a shared link with filters already set and the list filtered', async () => {
    await openLink('/queue?categoryId=no_rule_demo&status=in_progress');
    expect(await screen.findByRole('link', { name: 'A-999' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'A-998' })).toBeNull());
    expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('no_rule_demo');
    expect((screen.getByLabelText('Статус') as HTMLSelectElement).value).toBe('in_progress');
    expect(lastListQuery().get('categoryId')).toBe('no_rule_demo');
    expect(lastListQuery().get('status')).toBe('in_progress');
  });

  it('shows "Найдено: N из M" for the filtered result', async () => {
    await openLink('/queue?categoryId=no_rule_demo');
    expect(await screen.findByText('Найдено: 2')).toBeTruthy();
    expect(screen.getByText('из 3')).toBeTruthy();
  });

  it('clears the query string and shows the full list on «Сбросить»', async () => {
    const user = await openLink('/queue?departmentId=procurement&categoryId=no_rule_demo');
    await screen.findByText('Найдено: 2');
    await user.click(screen.getByRole('button', { name: 'Сбросить' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/queue'));
    expect(await screen.findByText('Найдено: 3')).toBeTruthy();
    expect((screen.getByLabelText('Подразделение') as HTMLSelectElement).value).toBe('');
    expect(lastListQuery().get('departmentId')).toBeNull();
  });

  it('ignores unknown values and keys in the query without an error', async () => {
    await openLink('/queue?departmentId=nope&categoryId=%3Cscript%3E&status=bogus&queue=x&overdue=maybe&dueAfter=yesterday&foo=bar&categoryId=no_rule_demo');
    expect(await screen.findByRole('link', { name: 'A-999' })).toBeTruthy();
    await waitFor(() => expect(lastListQuery().get('departmentId')).toBeNull());
    const params = lastListQuery();
    for (const key of ['status', 'queue', 'overdue', 'dueAfter', 'foo']) expect(params.get(key)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Статус') as HTMLSelectElement).value).toBe('');
  });
});
