import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';

const contract = JSON.parse(readFileSync(resolve('../contracts/api.yaml'), 'utf8'));
const item = { ...contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value,
  id: 'complaint-21', number: 'A-021', status: 'awaiting_clarification' };
const reference = contract.components.schemas.ReferenceData.examples[0];
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}</output>; }
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints/complaint-21') return Response.json(item);
    if (url.pathname === '/complaints') return Response.json({ items: [item], total: 1, limit: 20, offset: 0 });
    return Response.json({ items: [], unreadCount: 0, total: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('keeps the employee card open after switching from manager and visiting the list', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/my/complaint-21']}><App /><Location /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Обращение A-021' });
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByRole('heading', { name: 'Обращение A-021' });
  expect(screen.getByTestId('location').textContent).toBe('/queue/complaint-21');
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'employee');
  await screen.findByRole('heading', { name: 'Обращение A-021' });
  expect(screen.getByTestId('location').textContent).toBe('/my/complaint-21');
  await user.click(within(screen.getByRole('navigation', { name: 'Основное меню' })).getByRole('link', { name: 'Мои обращения' }));
  await user.click(await screen.findByRole('link', { name: 'A-021' }));
  expect(await screen.findByRole('heading', { name: 'Обращение A-021' })).toBeTruthy();
  expect(screen.getByTestId('location').textContent).toBe('/my/complaint-21');
});

it('does not return to the card when it finishes loading while the employee leaves for «Мои обращения»', async () => {
  // Карточка грузится, пока сотрудник уже ушёл в список: поздний рендер карточки не должен перетирать новый адрес.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const card = { ...item, id: 'complaint-22', number: 'A-022' };
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints/complaint-22') { await gate; return Response.json(card); }
    if (url.pathname === '/complaints') return Response.json({ items: [item, card], total: 2, limit: 20, offset: 0 });
    return Response.json({ items: [], unreadCount: 0, total: 0 });
  }));
  window.history.replaceState(null, '', '/my/complaint-22');
  render(<BrowserRouter><App /><Location /></BrowserRouter>);
  await screen.findByText('Загрузка обращения…');
  const mine = within(screen.getByRole('navigation', { name: 'Основное меню' })).getByRole('link', { name: 'Мои обращения' });
  // Клик (переход в transition) и ответ сервера по карточке (срочное обновление) обрабатываются в одной пачке.
  await act(async () => { mine.click(); release(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(await screen.findByRole('heading', { level: 1, name: 'Мои обращения' })).toBeTruthy();
  expect(window.location.pathname).toBe('/my');
  expect(screen.getByTestId('location').textContent).toBe('/my');
  window.history.replaceState(null, '', '/');
});
