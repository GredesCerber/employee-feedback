import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Root from '../src/app/Root';
import { SESSION_STORAGE_KEY } from '../src/app/session';

const open = () => render(<MemoryRouter><Root /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [], page: 1, pageSize: 20, total: 0, departments: [], categories: [], assignees: [] })));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('#288 условный вход по ролям', () => {
  it('без входа показывает экран с кнопками для каждой роли', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Вход в систему' })).toBeTruthy();
    for (const name of ['Войти как сотрудник', 'Войти как руководитель', 'Войти как администратор']) {
      expect(screen.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole('navigation', { name: 'Основное меню' })).toBeNull();
  });

  it('вход руководителем открывает очередь, выход возвращает на экран входа', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: /Войти как руководитель/ }));
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('manager-1');
    const nav = await screen.findByRole('navigation', { name: 'Основное меню' });
    expect(within(nav).getByRole('link', { name: 'Очередь обращений' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Вход в систему' })).toBeTruthy();
  });

  it('запомненный вход пропускает экран входа, второй сотрудник входит под своим id', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, 'manager-1');
    open();
    expect(await screen.findByRole('link', { name: 'Дашборд' })).toBeTruthy();
    cleanup();
    localStorage.clear();
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: /Сотрудник бухгалтерии/ }));
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('employee-2');
  });
});
