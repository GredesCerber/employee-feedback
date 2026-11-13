import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Root from '../src/app/Root';
import { LOCALE_STORAGE_KEY } from '../src/i18n/locale';
import { SESSION_STORAGE_KEY } from '../src/app/session';

const open = () => render(<MemoryRouter><Root /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [], page: 1, pageSize: 20, total: 0, departments: [], categories: [], assignees: [] })));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('#345 выбор языка на экране входа', () => {
  it('переключение языка меняет тексты экрана входа и сохраняется', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Вход в систему' })).toBeTruthy();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language / Язык / Тіл' }), 'en');
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language / Язык / Тіл' }), 'kk');
    expect(screen.getByRole('heading', { level: 1, name: 'Жүйеге кіру' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('kk');
  });

  it('выбранный язык остаётся после входа и после перезагрузки', async () => {
    const user = userEvent.setup();
    open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language / Язык / Тіл' }), 'en');
    await user.click(screen.getAllByRole('button', { name: /Sign in as/ })[0]!);
    const selector = await screen.findByRole('combobox', { name: 'Language / Язык / Тіл' }) as HTMLSelectElement;
    expect(selector.value).toBe('en');
    cleanup();
    localStorage.removeItem(SESSION_STORAGE_KEY);
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Language / Язык / Тіл' }) as HTMLSelectElement).value).toBe('en');
  });
});
