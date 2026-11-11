import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

const text = 'Склад не передаёт данные о приёмке отделу закупок вовремя';
let finishSuggestion: (response: Response) => void;
let suggestionStarted: boolean;

beforeEach(() => {
  suggestionStarted = false;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/reference-data') return Response.json({ categories: [
      { id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: null },
      { id: 'it_support', name: 'ИТ и доступы', dueInDays: 3, assigneeId: null },
    ], departments: [], assignees: [] });
    if (path === '/complaints/suggest-category') {
      suggestionStarted = true;
      return new Promise<Response>(resolve => { finishSuggestion = resolve; });
    }
    return Response.json({ items: [] });
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function startSuggestion() {
  render(<MemoryRouter initialEntries={['/submit']}><App /></MemoryRouter>);
  const description = await screen.findByLabelText('Описание');
  fireEvent.change(description, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
  await waitFor(() => expect(suggestionStarted).toBe(true));
  return description;
}

async function respond(source = 'demo-fixture') {
  await act(async () => { finishSuggestion(Response.json({ category: { id: 'it_support', name: 'ИТ и доступы' }, source })); });
}

it('#128 preserves the category chosen while the suggestion request is pending', async () => {
  await startSuggestion();
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'cross_department' } });
  await respond();
  expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('cross_department');
  const note = screen.getByRole('status', { name: 'Подсказка категории' });
  fireEvent.click(within(note).getByRole('button', { name: /Применить/ }));
  expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('it_support');
});

it('#128 ignores a suggestion for a description that has since changed', async () => {
  const description = await startSuggestion();
  fireEvent.change(description, { target: { value: 'Другая проблема с документами бухгалтерии' } });
  await respond();
  expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('');
  expect(screen.queryByRole('status', { name: 'Подсказка категории' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Отправить обращение' }) as HTMLButtonElement).disabled).toBe(false);
});

for (const [source, hint] of [['rules', /локальные правила/], ['llm', /ответ живой модели/]] as const) {
  it(`#128 accurately labels the ${source} source`, async () => {
    await startSuggestion();
    await respond(source);
    const note = screen.getByRole('status', { name: 'Подсказка категории' });
    expect(note.textContent).toMatch(hint);
    expect(note.textContent).not.toMatch(/записанный ответ/);
  });
}
