import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

afterEach(cleanup);
const open = (path = '/') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const menuLabels = () => within(screen.getByRole('navigation', { name: 'Основное меню' }))
  .getAllByRole('link').map(link => link.textContent);

describe('role navigation acceptance', () => {
  it('switches employee, manager and administrator menus and resets the active route', async () => {
    const user = userEvent.setup();
    open();
    expect(menuLabels()).toEqual(['Мои обращения', 'Новое обращение']);
    await user.click(screen.getByRole('link', { name: 'Новое обращение' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Новое обращение');
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    expect(menuLabels()).toEqual(['Очередь обращений']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Очередь обращений');
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
    expect(menuLabels()).toEqual(['Сводка']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Сводка');
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'employee');
    expect(menuLabels()).toEqual(['Мои обращения', 'Новое обращение']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Мои обращения');
    expect(screen.getByText(/только синтетические данные/i)).toBeTruthy();
  });

  it('does not expose manager content through a direct employee URL', () => {
    open('/queue');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Мои обращения');
    expect(screen.queryByRole('link', { name: 'Очередь обращений' })).toBeNull();
  });

  it('provides a useful unknown-route page with a working return link', async () => {
    const user = userEvent.setup();
    open('/missing');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Страница не найдена');
    await user.click(screen.getByRole('link', { name: 'Вернуться к обращениям' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Мои обращения');
  });
});
