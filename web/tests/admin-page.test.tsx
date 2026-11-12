import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import Root from '../src/app/Root';

type U = { id: string; name: string; role: string; departmentId: string; active: boolean };
let users: U[];
let calls: { method: string; path: string; body?: unknown }[];
const reference = {
  departments: [{ id: 'sales', name: 'Продажи' }, { id: 'procurement', name: 'Закупки' }],
  categories: [{ id: 'training', name: 'Обучение', assigneeId: 'manager-1', dueInDays: 7 }],
  assignees: [],
};
beforeEach(() => {
  localStorage.clear();
  calls = [];
  users = [
    { id: 'manager-1', name: 'Руководитель закупок', role: 'manager', departmentId: 'procurement', active: true },
    { id: 'admin-1', name: 'Администратор демо', role: 'admin', departmentId: 'procurement', active: true },
  ];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    const body = request.method === 'GET' ? undefined : await request.json();
    if (request.method !== 'GET') calls.push({ method: request.method, path, body });
    if (path === '/admin/users' && request.method === 'GET') return Response.json({ items: users });
    if (path === '/admin/users') { const user = { id: 'employee-31', ...(body as object), active: true } as U; users.push(user); return Response.json(user, { status: 201 }); }
    if (path.startsWith('/admin/users/')) { const user = users.find(item => path.endsWith(item.id))!; Object.assign(user, body); return Response.json(user); }
    if (path === '/reference-data') return Response.json(reference);
    if (path === '/demo-accounts') return Response.json({ items: [{ id: 'employee-1', name: 'Сотрудник закупок', role: 'employee', departmentId: 'procurement' }, { id: 'employee-31', name: 'Новая Участница', role: 'employee', departmentId: 'sales' }] });
    if (path === '/session') return Response.json({ id: 'employee-31', name: 'Новая Участница', role: 'employee', departmentId: 'sales' });
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('раздел администратора: пользователи и права', () => {
  async function openAdmin() {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/admin']}><App initialUserId="admin-1" /></MemoryRouter>);
    await screen.findByRole('table', { name: 'Пользователи' });
    return user;
  }

  it('виден в меню администратора и показывает пользователей', async () => {
    await openAdmin();
    expect(within(screen.getByRole('navigation', { name: 'Основное меню' })).getByRole('link', { name: 'Пользователи и права' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Пользователи' })).getByRole('row', { name: /Руководитель закупок/ })).toBeTruthy();
  });

  it('добавляет участника с ФИО, подразделением и ролью', async () => {
    const user = await openAdmin();
    await user.type(screen.getByLabelText('ФИО'), 'Новая Участница');
    await user.selectOptions(screen.getByLabelText('Подразделение'), 'sales');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    await screen.findByText('Участник добавлен: он появился на экране входа.');
    expect(calls[0]).toEqual({ method: 'POST', path: '/admin/users', body: { name: 'Новая Участница', role: 'employee', departmentId: 'sales' } });
    expect(await screen.findByRole('row', { name: /Новая Участница/ })).toBeTruthy();
  });

  it('меняет роль и деактивирует; себя менять нельзя', async () => {
    const user = await openAdmin();
    await user.selectOptions(screen.getByLabelText('Роль: Руководитель закупок'), 'employee');
    await waitFor(() => expect(calls.at(-1)).toEqual({ method: 'PATCH', path: '/admin/users/manager-1', body: { role: 'employee' } }));
    const row = within(screen.getByRole('table', { name: 'Пользователи' })).getByRole('row', { name: /Руководитель закупок/ });
    await user.click(within(row).getByRole('button', { name: 'Деактивировать' }));
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ active: false }));
    expect((screen.getByRole('button', { name: 'Деактивировать' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Роль: Администратор демо') as HTMLSelectElement).disabled).toBe(true);
  });

  it('новый участник виден на экране входа, а вход берёт роль у сервера', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Root /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: /Новая Участница/ });
    await user.click(button);
    expect(localStorage.getItem('demo-session')).toBe('employee-31');
    expect(await screen.findByRole('navigation', { name: 'Основное меню' })).toBeTruthy();
    expect(await screen.findByText('Новая Участница')).toBeTruthy();
  });
});
