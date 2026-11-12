import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';

function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /><LocationProbe /></MemoryRouter>);
const location = () => screen.getByTestId('location').textContent;
const role = () => screen.getByLabelText('Демонстрационная роль');
const notice = () => screen.queryByRole('status', { name: 'Ограничение доступа' });
beforeEach(() => {
  sessionStorage.clear(); // черновик формы подачи (#312 A2) не переходит между тестами
  localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json({ categories: [], departments: [], assignees: [] });
    if (url.pathname === '/complaints') return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
    return Response.json({ code: 'NOT_FOUND', message: 'Нет данных.' }, { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('#283 access redirect notice', () => {
  it.each([
    ['/queue?status=new', 'Эта страница доступна руководителю.'],
    ['/summary', 'Эта страница доступна администратору.'],
    ['/dashboard', 'Эта страница доступна руководителю или администратору.'],
  ])('explains the required role for %s without exposing the address', async (path, message) => {
    const user = userEvent.setup(); open(path);
    expect(location()).toBe('/my');
    const panel = await screen.findByRole('status', { name: 'Ограничение доступа' });
    expect(within(panel).getByText(message)).toBeTruthy();
    expect(panel.textContent).not.toContain(path);
    await user.click(within(panel).getByRole('button', { name: 'Перейти к моим обращениям' }));
    expect(location()).toBe('/my'); expect(notice()).toBeNull();
  });
  it('keeps the requested filtered address on role switch and clears the notice', async () => {
    const user = userEvent.setup(); open('/queue?status=new');
    expect(await screen.findByRole('status', { name: 'Ограничение доступа' })).toBeTruthy();
    await user.selectOptions(role(), 'manager');
    expect(location()).toBe('/queue?status=new'); expect(notice()).toBeNull();
  });
  it.each([['/queue', 'manager'], ['/summary', 'admin']])('does not show a notice when returning to allowed home %s', async (path, nextRole) => {
    const user = userEvent.setup(); open(path);
    expect(await screen.findByRole('status', { name: 'Ограничение доступа' })).toBeTruthy();
    await user.selectOptions(role(), nextRole);
    expect(location()).toBe(path);
    expect(notice()).toBeNull();
  });
  it('clears the notice on ordinary navigation and does not show it on an accessible page', async () => {
    const user = userEvent.setup(); open('/queue');
    expect(await screen.findByRole('status', { name: 'Ограничение доступа' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Новое обращение' }));
    expect(location()).toBe('/submit'); expect(notice()).toBeNull();
  });
  it('explains when a role switch leaves a protected page', async () => {
    const user = userEvent.setup(); open('/submit');
    expect(notice()).toBeNull();
    await user.selectOptions(role(), 'manager');
    expect(location()).toBe('/queue');
    const panel = await screen.findByRole('status', { name: 'Ограничение доступа' });
    expect(within(panel).getByText('Эта страница доступна сотруднику.')).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: 'Перейти к очереди обращений' }));
    expect(notice()).toBeNull();
  });
  it('returns to the filtered queue after switching manager to employee and back', async () => {
    const user = userEvent.setup(); open('/queue?status=new');
    await user.selectOptions(role(), 'manager');
    expect(location()).toBe('/queue?status=new');
    await user.selectOptions(role(), 'employee');
    expect(location()).toBe('/my');
    expect(await screen.findByRole('status', { name: 'Ограничение доступа' })).toBeTruthy();
    await user.selectOptions(role(), 'manager');
    expect(location()).toBe('/queue?status=new');
    expect(notice()).toBeNull();
  });
  it('preserves the complaint card on role switch', async () => {
    const user = userEvent.setup(); open('/my/complaint-1');
    expect(location()).toBe('/my/complaint-1'); expect(notice()).toBeNull();
    await user.selectOptions(role(), 'manager');
    expect(location()).toBe('/queue/complaint-1'); expect(notice()).toBeNull();
  });
  it.each([
    ['en', 'Access restriction', 'This page is available to managers.', 'Go to my requests'],
    ['kk', 'Қолжетімділікті шектеу', 'Бұл бет басшыға қолжетімді.', 'Менің өтініштеріме өту'],
  ])('translates the explanation and action for %s', async (locale, label, message, button) => {
    localStorage.setItem('employee-feedback.locale', locale); open('/queue');
    const panel = await screen.findByRole('status', { name: label });
    expect(within(panel).getByText(message)).toBeTruthy();
    expect(within(panel).getByRole('button', { name: button })).toBeTruthy();
  });
});
