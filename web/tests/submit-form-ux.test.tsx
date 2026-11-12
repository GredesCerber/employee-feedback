import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { draftKey, readDraft, writeDraft } from '../src/features/submitDraft';
import { CATEGORY_EXAMPLES, SUBMIT_LIMITS, counterWarning } from '../src/features/submitForm';

// #312 A2–A5: черновик формы подачи, счётчик символов, карточки категорий, три блока формы.
const categories = [
  { id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: null },
  { id: 'it', name: 'Интеграции и IT', dueInDays: 7, assigneeId: null },
  { id: 'no_rule_demo', name: 'Категория без ответственного (демо)', dueInDays: 7, assigneeId: null },
];
let submitted: unknown[];
let postMode: 'ok' | 'fail';

beforeEach(() => {
  sessionStorage.clear();
  submitted = []; postMode = 'ok';
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/reference-data') return Response.json({ categories, departments: [], assignees: [] });
    if (path === '/complaints/suggest-category') return Response.json({ category: { id: 'it', name: 'Интеграции и IT' }, source: 'rules' });
    if (path === '/complaints' && request.method === 'POST') {
      if (postMode === 'fail') return Response.json({ code: 'INTERNAL_ERROR', message: 'boom' }, { status: 500 });
      submitted.push(await request.json());
      return Response.json({ id: 'c-312', number: 'A-312', nextAction: 'Ответственный рассмотрит обращение.' }, { status: 201 });
    }
    return Response.json({ items: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); sessionStorage.clear(); });

async function openForm() {
  const user = userEvent.setup();
  const view = render(<MemoryRouter initialEntries={['/submit']}><App /></MemoryRouter>);
  const description = await screen.findByLabelText('Описание') as HTMLTextAreaElement;
  return { user, view, description, category: screen.getByLabelText('Категория') as HTMLSelectElement, solution: screen.getByLabelText(/Предлагаемое решение/) as HTMLTextAreaElement };
}

describe('#312 A3 character counter', () => {
  it('uses the limits from contracts/api.yaml CreateComplaint', () => {
    const contract = JSON.parse(readFileSync(existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml'), 'utf8'));
    const schema = contract.components.schemas.CreateComplaint.properties;
    expect(SUBMIT_LIMITS.description).toBe(schema.description.maxLength);
    expect(SUBMIT_LIMITS.proposedSolution).toBe(schema.proposedSolution.maxLength);
  });

  it('shows «n / 5000» for description and solution, linked with aria-describedby', async () => {
    const { user, description, solution } = await openForm();
    expect(description.maxLength).toBe(5000);
    const counter = document.getElementById(description.getAttribute('aria-describedby')!)!;
    expect(counter.textContent).toContain('0 / 5000');
    await user.type(description, 'Привет');
    expect(counter.textContent).toContain('6 / 5000');
    const solutionCounter = document.getElementById(solution.getAttribute('aria-describedby')!)!;
    expect(solutionCounter.textContent).toContain('0 / 5000');
  });

  it('switches to a warning state near the limit and says how many characters are left', async () => {
    const { description } = await openForm();
    expect(counterWarning(4499, 5000)).toBe(false);
    expect(counterWarning(4500, 5000)).toBe(true);
    fireEvent.change(description, { target: { value: 'а'.repeat(4600) } });
    const counter = document.getElementById('description-counter')!;
    expect(counter.dataset.state).toBe('warning');
    expect(counter.className).toContain('is-warning');
    expect(counter.textContent).toContain('4600 / 5000');
    expect(counter.textContent).toContain('Осталось символов: 400');
  });
});

describe('#312 A2 draft in sessionStorage', () => {
  it('restores category, texts, anonymity and location after leaving the form, with a visible note', async () => {
    const first = await openForm();
    await first.user.selectOptions(first.category, 'cross_department');
    await first.user.type(first.description, 'Черновик описания');
    await first.user.type(first.solution, 'Моё решение');
    await first.user.click(screen.getByLabelText('Подать анонимно'));
    // Точку на карте в jsdom не поставить, кладём её в черновик напрямую — проверяем чтение.
    const saved = readDraft('employee')!;
    writeDraft('employee', { ...saved, location: { latitude: 55.01, longitude: 73.37 } });
    first.view.unmount();

    const second = await openForm();
    expect(second.description.value).toBe('Черновик описания');
    expect(second.solution.value).toBe('Моё решение');
    expect(second.category.value).toBe('cross_department');
    expect((screen.getByLabelText('Подать анонимно') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Точка выбрана/)).toBeTruthy();
    expect(screen.getByText('Черновик восстановлен')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Очистить' })).toBeTruthy();
  });

  it('does not show the note for an empty form and stores nothing for it', async () => {
    await openForm();
    expect(screen.queryByText('Черновик восстановлен')).toBeNull();
    expect(sessionStorage.getItem(draftKey('employee'))).toBeNull();
  });

  it('«Очистить» empties the form and the stored draft and moves focus to the description', async () => {
    writeDraft('employee', { type: 'suggestion', categoryId: 'it', description: 'Старый текст', solution: 'Решение', anonymous: true });
    const { user, description, category, solution } = await openForm();
    expect(description.value).toBe('Старый текст');
    await user.click(screen.getByRole('button', { name: 'Очистить' }));
    expect(description.value).toBe('');
    expect(solution.value).toBe('');
    expect(category.value).toBe('');
    expect((screen.getByLabelText('Тип обращения') as HTMLSelectElement).value).toBe('problem');
    expect((screen.getByLabelText('Подать анонимно') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText('Черновик восстановлен')).toBeNull();
    expect(sessionStorage.getItem(draftKey('employee'))).toBeNull();
    expect(document.activeElement).toBe(description);
  });

  it('keeps the draft after a failed submit and clears it after a successful one', async () => {
    const { user, description, category } = await openForm();
    await user.selectOptions(category, 'cross_department');
    await user.type(description, 'Текст обращения');
    postMode = 'fail';
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    await screen.findByText(/Сервер временно недоступен|Не удалось|ошиб/i);
    expect(readDraft('employee')?.description).toBe('Текст обращения');
    postMode = 'ok';
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(await screen.findByRole('heading', { name: 'Обращение зарегистрировано' })).toBeTruthy();
    expect(submitted).toHaveLength(1);
    expect(sessionStorage.getItem(draftKey('employee'))).toBeNull();
  });

  it('keeps drafts per role and ignores broken storage data', () => {
    writeDraft('employee', { type: 'problem', categoryId: '', description: 'сотрудник', solution: '', anonymous: false });
    expect(readDraft('manager')).toBeUndefined();
    expect(readDraft('employee')?.description).toBe('сотрудник');
    sessionStorage.setItem(draftKey('employee'), '{not json');
    expect(readDraft('employee')).toBeUndefined();
    sessionStorage.setItem(draftKey('employee'), JSON.stringify({ type: 'hack', description: 42, location: { latitude: 500, longitude: 1 } }));
    expect(readDraft('employee')).toBeUndefined();
  });

  it('works without storage access', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { user, description } = await openForm();
    await user.type(description, 'Без хранилища');
    expect(description.value).toBe('Без хранилища');
    spy.mockRestore(); set.mockRestore();
  });
});

describe('#312 A4 category cards', () => {
  it('shows cards with real-life examples as a radio group; the full select stays as a fallback', async () => {
    await openForm();
    const group = screen.getByRole('group', { name: 'На что похожа ситуация?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(within(group).getByText(CATEGORY_EXAMPLES.it!)).toBeTruthy();
    // Демо-категория без примера — только в списке.
    expect(within(group).queryByText(/Категория без ответственного/)).toBeNull();
    expect(screen.getByRole('option', { name: 'Категория без ответственного (демо)' })).toBeTruthy();
  });

  it('keeps cards and select in sync both ways', async () => {
    const { user, category } = await openForm();
    const group = screen.getByRole('group', { name: 'На что похожа ситуация?' });
    await user.click(within(group).getByRole('radio', { name: /Интеграции и IT/ }));
    expect(category.value).toBe('it');
    await user.selectOptions(category, 'cross_department');
    expect((within(group).getByRole('radio', { name: /Межотдельное взаимодействие/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(group).getByRole('radio', { name: /Интеграции и IT/ }) as HTMLInputElement).checked).toBe(false);
  });

  it('auto-suggestion still fills the category and highlights the suggested card', async () => {
    const { user, description, category } = await openForm();
    await user.type(description, 'Одни и те же данные вводим в разные системы');
    await user.click(screen.getByRole('button', { name: 'Подсказать категорию' }));
    await screen.findByText('Предложено подсказкой');
    expect(category.value).toBe('it');
    const card = document.querySelector('.category-card[data-category="it"]')!;
    expect(card.className).toContain('is-suggested');
    expect(card.className).toContain('is-selected');
    expect(document.querySelector('.category-card[data-category="cross_department"]')!.className).not.toContain('is-suggested');
  });
});

describe('#312 A5 three form blocks', () => {
  it('groups the form into «Что случилось», «Что предлагаете», «Как подать» in order', async () => {
    await openForm();
    const blocks = [...document.querySelectorAll('fieldset.form-block')];
    expect(blocks.map(block => block.querySelector('legend')!.textContent!.replace(/^\d/, ''))).toEqual(['Что случилось', 'Что предлагаете', 'Как подать']);
    expect(within(blocks[0] as HTMLElement).getByLabelText('Описание')).toBeTruthy();
    expect(within(blocks[1] as HTMLElement).getByLabelText(/Предлагаемое решение/)).toBeTruthy();
    const how = within(blocks[2] as HTMLElement);
    expect(how.getByLabelText('Подать анонимно')).toBeTruthy();
    expect(how.getByText(/Указать место на карте/)).toBeTruthy();
    expect(how.getByText(/Анонимность скрывает ваше имя/)).toBeTruthy();
  });
});
