import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

let submitted: unknown[];
beforeEach(() => {
  sessionStorage.clear(); // черновик формы подачи (#312 A2) не переходит между тестами
  submitted = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/reference-data') return Response.json({ categories: [{ id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: null }], departments: [], assignees: [] });
    if (path === '/complaints/suggest-category') return Response.json({ category: { id: 'cross_department', name: 'Межотдельное взаимодействие' }, source: 'rules' });
    if (path === '/complaints' && request.method === 'POST') {
      submitted.push(await request.json());
      return Response.json({ id: 'qa-249', number: 'A-021', nextAction: 'Ответственный рассмотрит обращение.' }, { status: 201 });
    }
    return Response.json({ items: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function invalidForm() {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/submit']}><App /></MemoryRouter>);
  const category = await screen.findByLabelText('Категория');
  const description = screen.getByLabelText('Описание');
  const send = screen.getByRole('button', { name: 'Отправить обращение' });
  await user.click(send);
  expect(screen.getByText('Выберите категорию.')).toBeTruthy();
  expect(screen.getByText('Опишите проблему или предложение.')).toBeTruthy();
  return { user, category, description, send };
}

describe('#249 recover required-field validation as the user corrects input', () => {
  it('clears only the chosen category error and focuses the still-empty description on submit', async () => {
    const { user, category, description, send } = await invalidForm();
    await user.selectOptions(category, 'cross_department');
    expect(screen.queryByText('Выберите категорию.')).toBeNull();
    expect(category.getAttribute('aria-invalid')).toBe('false');
    expect(category.hasAttribute('aria-describedby')).toBe(false);
    expect(screen.getByText('Опишите проблему или предложение.')).toBeTruthy();
    await user.click(send);
    expect(document.activeElement).toBe(description);
    expect(submitted).toHaveLength(0);
  });

  it('keeps whitespace invalid, then clears only the description error without losing text', async () => {
    const { user, category, description, send } = await invalidForm();
    await user.type(description, '   ');
    expect(description.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Опишите проблему или предложение.')).toBeTruthy();
    await user.type(description, 'Нужен шаблон заявки');
    expect(screen.queryByText('Опишите проблему или предложение.')).toBeNull();
    expect(description.getAttribute('aria-invalid')).toBe('false');
    // После #312 A3 поле всегда описано счётчиком символов, но ссылка на ошибку уходит вместе с ней.
    expect(description.getAttribute('aria-describedby')).toBe('description-counter');
    expect(screen.getByText('Выберите категорию.')).toBeTruthy();
    await user.click(send);
    expect(document.activeElement).toBe(category);
    expect((description as HTMLTextAreaElement).value).toBe('   Нужен шаблон заявки');
    expect(submitted).toHaveLength(0);
  });

  it('submits the corrected values normally after both errors disappear', async () => {
    const { user, category, description, send } = await invalidForm();
    await user.selectOptions(category, 'cross_department');
    await user.type(description, '  Нужен шаблон заявки  ');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    await user.click(send);
    expect(await screen.findByRole('heading', { name: 'Обращение зарегистрировано' })).toBeTruthy();
    expect(submitted).toEqual([{ type: 'problem', categoryId: 'cross_department', description: 'Нужен шаблон заявки' }]);
  });

  it('also clears the category error when the assistant selects it for the user', async () => {
    const { user, category, description } = await invalidForm();
    await user.type(description, 'Нужен шаблон заявки');
    await user.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
    expect(await screen.findByText('Эта категория уже выбрана.', { exact: false })).toBeTruthy();
    expect((category as HTMLSelectElement).value).toBe('cross_department');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(category.getAttribute('aria-invalid')).toBe('false');
    expect(submitted).toHaveLength(0);
  });
});
