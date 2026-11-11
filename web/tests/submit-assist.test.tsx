import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { ABOUT_ROWS } from '../src/features/demo';

// #128 (идея #83): похожие обращения и «Подсказать категорию» в форме подачи. Подменённый fetch, без сети.
const categories = [
  { id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: null },
  { id: 'it_support', name: 'ИТ и доступы', dueInDays: 3, assigneeId: null },
];
const text = 'Склад не передаёт данные о приёмке отделу закупок вовремя';
type Mode = 'ok' | 'empty' | 'server' | 'network' | 'rate' | 'none';
let mode: { similar: Mode; suggest: Mode };
let requests: { path: string; text: string | null }[];
let created: unknown[];

beforeEach(() => {
  mode = { similar: 'ok', suggest: 'ok' }; requests = []; created = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json({ categories, departments: [], assignees: [] });
    if (request.method === 'POST' && url.pathname === '/complaints') { created.push(await request.json()); return Response.json({ id: 'c-1', number: 'A-100', nextAction: 'ok' }, { status: 201 }); }
    const key = url.pathname === '/complaints/similar' ? 'similar' : url.pathname === '/complaints/suggest-category' ? 'suggest' : undefined;
    if (!key) return Response.json({});
    requests.push({ path: url.pathname, text: url.searchParams.get('text') });
    const current = mode[key];
    if (current === 'network') throw new TypeError('Failed to fetch');
    if (current === 'server') return Response.json({ code: 'INTERNAL_ERROR', message: 'boom' }, { status: 500 });
    if (current === 'rate') return Response.json({ code: 'RATE_LIMITED', message: 'slow' }, { status: 429, headers: { 'Retry-After': '3' } });
    if (key === 'similar') return Response.json({ items: current === 'empty' ? [] : [
      { id: 'a-1', number: 'A-001', categoryId: 'cross_department', categoryName: 'Межотдельное взаимодействие', status: 'in_review', score: 0.8 },
      { id: 'a-2', number: 'A-007', categoryId: 'it_support', categoryName: 'ИТ и доступы', status: 'closed', score: 0.3 },
    ] });
    return Response.json(current === 'none' ? { category: null, source: 'none' } : { category: { id: 'it_support', name: 'ИТ и доступы' }, source: 'demo-fixture' });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openForm() {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/submit']}><App /></MemoryRouter>);
  const description = await screen.findByLabelText('Описание');
  return { user, description: description as HTMLTextAreaElement };
}
const similarCalls = () => requests.filter(item => item.path === '/complaints/similar');

describe('#128 similar complaints', () => {
  it('shows up to 3 similar complaints (number, category, status) 500 ms after typing, not before', async () => {
    const { description } = await openForm();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(description, { target: { value: text } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(similarCalls()).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    const list = await screen.findByRole('list', { name: 'Похожие обращения' });
    expect(similarCalls()).toHaveLength(1);
    expect(similarCalls()[0]!.text).toBe(text);
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toMatch(/A-001/);
    expect(items[0]!.textContent).toMatch(/Межотдельное взаимодействие/);
    expect(items[0]!.textContent).toMatch(/На рассмотрении/);
    expect(items[1]!.textContent).toMatch(/Закрыто/);
  });

  it('debounces: only the last text is requested, and short text (10 characters or fewer) is not', async () => {
    const { description } = await openForm();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(description, { target: { value: 'коротко 10' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(similarCalls()).toHaveLength(0);
    fireEvent.change(description, { target: { value: 'Склад не передаёт данные о приёмке' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.change(description, { target: { value: text } });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(similarCalls().map(item => item.text)).toEqual([text]);
  });

  it('shows nothing when there are no matches', async () => {
    mode.similar = 'empty';
    const { description } = await openForm();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(description, { target: { value: text } });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(similarCalls()).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Похожие обращения' })).toBeNull();
  });
});

describe('#128 category suggestion', () => {
  it('fills the category from the API with a «Демо ИИ» badge that says it is a recorded answer', async () => {
    const { user, description } = await openForm();
    expect((screen.getByRole('button', { name: 'Подсказать категорию' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(description, text);
    await user.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
    await waitFor(() => expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('it_support'));
    const note = screen.getByRole('status', { name: 'Подсказка категории' });
    expect(note.textContent).toMatch(/ИТ и доступы/);
    const badge = note.querySelector('.imitation-badge');
    expect(badge?.textContent).toMatch(/Демо ИИ/);
    expect(badge?.textContent).toMatch(/записанный ответ/);
    expect(badge?.textContent).toMatch(/не живая модель/);
  });

  it('does not overwrite a category the user already chose; applies it only on click', async () => {
    const { user, description } = await openForm();
    await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
    await user.type(description, text);
    await user.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
    const note = await screen.findByRole('status', { name: 'Подсказка категории' });
    expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('cross_department');
    await user.click(within(note).getByRole('button', { name: /Применить/ }));
    expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('it_support');
  });

  it('says so when there is no suggestion and keeps the category empty', async () => {
    mode.suggest = 'none';
    const { user, description } = await openForm();
    await user.type(description, text);
    await user.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
    expect((await screen.findByRole('status', { name: 'Подсказка категории' })).textContent).toMatch(/не нашлось/);
    expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('');
  });
});

describe('#128 errors never block submission', () => {
  for (const failure of ['server', 'network'] as const) {
    it(`${failure} failure of both helpers: form still submits`, async () => {
      mode.similar = failure; mode.suggest = failure;
      const { user, description } = await openForm();
      await user.type(description, text);
      await user.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
      expect((await screen.findByRole('status', { name: 'Подсказка категории' })).textContent).toMatch(/недоступна/);
      await waitFor(() => expect(similarCalls().length).toBeGreaterThan(0));
      expect(screen.queryByRole('list', { name: 'Похожие обращения' })).toBeNull();
      await user.selectOptions(screen.getByLabelText('Категория'), 'it_support');
      const submit = screen.getByRole('button', { name: 'Отправить обращение' }) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
      await user.click(submit);
      expect(await screen.findByText('A-100')).toBeTruthy();
      expect(created).toHaveLength(1);
    });
  }

  it('429 on helpers shows a wait message but leaves the submit button enabled', async () => {
    mode.similar = 'rate'; mode.suggest = 'rate';
    const { user, description } = await openForm();
    await user.type(description, text);
    await user.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
    expect((await screen.findByRole('status', { name: 'Подсказка категории' })).textContent).toMatch(/Слишком много запросов/);
    expect((screen.getByRole('button', { name: 'Отправить обращение' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('#128 «О прототипе»', () => {
  it('no longer says the AI helper is missing', () => {
    const row = ABOUT_ROWS.find(item => item.feature.startsWith('ИИ-помощник'))!;
    expect(row.build ?? '').not.toMatch(/ещё нет/);
    expect(row.build ?? '').toMatch(/#128/);
  });
});
