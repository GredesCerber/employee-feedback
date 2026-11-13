import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../src/i18n';
import LoginPage from '../src/app/LoginPage';

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const body = await request.clone().json().catch(() => ({}));
    if (new URL(request.url).pathname === '/auth/login' && body.password === 'demo1234') {
      return Response.json({ token: 'signed-token', user: { id: 'manager-1', name: 'Руководитель закупок', role: 'manager', departmentId: 'procurement' } });
    }
    return Response.json({ code: 'UNAUTHENTICATED', message: 'Неверный логин или пароль.', requestId: 'r' }, { status: 401 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('вход по учётной записи рядом с быстрым выбором роли', () => {
  it('shows the role picker and signs in with login and password', async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();
    render(<I18nProvider><LoginPage onLogin={onLogin} /></I18nProvider>);
    expect(screen.getAllByRole('button', { name: /Войти как/ }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Войти по учётной записи' }));
    await user.type(screen.getByLabelText('Логин (код или ФИО)'), 'manager-1');
    await user.type(screen.getByLabelText('Пароль'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Пароль'));
    await user.type(screen.getByLabelText('Пароль'), 'demo1234');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('manager-1', 'signed-token'));
  });
});
