import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
let hidden: boolean;

function Where() { const location = useLocation(); return <output data-testid="where">{location.pathname}</output>; }
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /><Where /></MemoryRouter>);
const where = () => screen.getByTestId('where').textContent;
const role = () => screen.getByLabelText('Демонстрационная роль');

beforeEach(() => {
  hidden = false;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === `/complaints/${example.id}`) {
      // Чужое обращение для сотрудника: сервер отвечает тем же 404, что и на неизвестный id.
      if (hidden && request.headers.get('X-Demo-User')?.includes('employee')) return Response.json({ code: 'NOT_FOUND', message: 'Обращение не найдено.' }, { status: 404 });
      return Response.json(example);
    }
    if (url.pathname === '/complaints') return Response.json({ items: [example], page: 1, pageSize: 20, total: 1 });
    return Response.json({ code: 'NOT_FOUND', message: 'Нет в тестовой заглушке.' }, { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('#203 role switch keeps the open complaint card', () => {
  it('manager on /queue/:id switching to employee opens /my/:id with the same id', async () => {
    const user = userEvent.setup();
    // Сценарий демо: прямая ссылка на карточку в очереди, роль переключают на руководителя.
    open(`/queue/${example.id}`);
    await user.selectOptions(role(), 'manager');
    expect(where()).toBe(`/queue/${example.id}`);
    await user.selectOptions(role(), 'employee');
    expect(where()).toBe(`/my/${example.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: `Обращение ${example.number}` })).toBeTruthy();
  });

  it('employee on /my/:id switching to manager opens /queue/:id', async () => {
    const user = userEvent.setup();
    open(`/my/${example.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: `Обращение ${example.number}` })).toBeTruthy();
    await user.selectOptions(role(), 'manager');
    expect(where()).toBe(`/queue/${example.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: `Обращение ${example.number}` })).toBeTruthy();
  });

  it('a complaint that is not readable for the new role shows a clear message instead of crashing', async () => {
    const user = userEvent.setup();
    hidden = true;
    open(`/queue/${example.id}`);
    await user.selectOptions(role(), 'manager');
    expect(where()).toBe(`/queue/${example.id}`);
    await user.selectOptions(role(), 'employee');
    expect(where()).toBe(`/my/${example.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Обращение недоступно' })).toBeTruthy();
    expect(screen.getByText('Обращение не найдено.')).toBeTruthy();
  });

  it('keeps the old returnPath behaviour for other menu paths', async () => {
    const user = userEvent.setup();
    open('/dashboard');
    // Сотрудник на /dashboard уходит на /my, запомнив адрес; руководитель возвращается на него.
    expect(where()).toBe('/my');
    await user.selectOptions(role(), 'manager');
    expect(where()).toBe('/dashboard');
    await user.selectOptions(role(), 'admin');
    expect(where()).toBe('/summary');
    await user.selectOptions(role(), 'employee');
    expect(where()).toBe('/my');
    await user.click(screen.getByRole('link', { name: 'Новое обращение' }));
    await user.selectOptions(role(), 'manager');
    expect(where()).toBe('/queue');
  });

  it('admin has no complaint card route, so switching from a card goes to the admin home', async () => {
    const user = userEvent.setup();
    open(`/my/${example.id}`);
    await user.selectOptions(role(), 'admin');
    expect(where()).toBe('/summary');
  });
});
