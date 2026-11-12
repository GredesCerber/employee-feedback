import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { readDraft } from '../src/features/submitDraft';

// #312 B1: блок «Предложить идею» на главной сотрудника — тип «Предложение», категория, одно поле, ссылка на полную форму.
const categories = [
  { id: 'it', name: 'Интеграции и IT', dueInDays: 7, assigneeId: null },
  { id: 'training', name: 'Обучение', dueInDays: 7, assigneeId: null },
];
let submitted: Record<string, unknown>[];
let listCalls: number;

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  submitted = []; listCalls = 0;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/reference-data') return Response.json({ categories, departments: [], assignees: [] });
    if (path === '/complaints' && request.method === 'POST') {
      submitted.push(await request.json() as Record<string, unknown>);
      return Response.json({ id: 'c-idea', number: 'MT-0312', type: 'suggestion', nextAction: 'Ответственный рассмотрит обращение.' }, { status: 201 });
    }
    if (path === '/complaints') { listCalls += 1; return Response.json({ items: [], total: 0, limit: 20, offset: 0 }); }
    return Response.json({ items: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); sessionStorage.clear(); });

async function openHome() {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
  const block = await screen.findByRole('region', { name: 'Предложить идею' });
  await within(block).findByRole('option', { name: 'Интеграции и IT' });
  return { user, block: within(block) };
}

describe('#312 B1 «Предложить идею» на главной сотрудника', () => {
  it('отправляет обращение типа suggestion с категорией и одним текстом и показывает номер', async () => {
    const { user, block } = await openHome();
    const callsBefore = listCalls;
    await user.selectOptions(block.getByLabelText('Категория идеи'), 'it');
    await user.type(block.getByLabelText('Ваша идея'), '  Сделать общий календарь отпусков  ');
    await user.click(block.getByRole('button', { name: 'Отправить идею' }));
    expect(await block.findByText(/Идея отправлена, номер MT-0312/)).toBeTruthy();
    expect(submitted).toEqual([{ type: 'suggestion', categoryId: 'it', description: 'Сделать общий календарь отпусков' }]);
    expect(block.getByRole('link', { name: 'Открыть обращение' }).getAttribute('href')).toBe('/my/c-idea');
    expect((block.getByLabelText('Ваша идея') as HTMLTextAreaElement).value).toBe('');
    // Список «Моих обращений» перезагружается, чтобы новая идея появилась в нём.
    expect(listCalls).toBeGreaterThan(callsBefore);
  });

  it('без категории и текста ничего не отправляет и показывает ошибки у полей', async () => {
    const { user, block } = await openHome();
    await user.click(block.getByRole('button', { name: 'Отправить идею' }));
    expect(block.getByText('Выберите категорию.')).toBeTruthy();
    expect(block.getByText('Опишите идею.')).toBeTruthy();
    expect(block.getByLabelText('Категория идеи').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement?.id).toBe('idea-category');
    expect(submitted).toHaveLength(0);
  });

  it('«Полная форма» переносит набранное в черновик формы подачи как предложение', async () => {
    const { user, block } = await openHome();
    await user.selectOptions(block.getByLabelText('Категория идеи'), 'training');
    await user.type(block.getByLabelText('Ваша идея'), 'Курс по 1С для новичков');
    await user.click(block.getByRole('button', { name: /Полная форма/ }));
    expect(readDraft('employee')).toMatchObject({ type: 'suggestion', categoryId: 'training', description: 'Курс по 1С для новичков' });
    const description = await screen.findByLabelText('Описание') as HTMLTextAreaElement;
    expect(description.value).toBe('Курс по 1С для новичков');
    expect((screen.getByLabelText('Тип обращения') as HTMLSelectElement).value).toBe('suggestion');
    expect(submitted).toHaveLength(0);
  });
});
