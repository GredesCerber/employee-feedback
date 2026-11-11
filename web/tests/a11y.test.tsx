// Доступность (#113, R10): метки, required, aria-describedby, aria-live, фокус, клавиатура, смысл не только цветом.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
let current: Complaint;

beforeEach(() => {
  current = { ...structuredClone(example), status: 'new', overdue: true };
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints' && request.method === 'GET') return Response.json({ items: [current], total: 1, limit: 20, offset: 0 });
    if (url.pathname === '/complaints') return Response.json(current, { status: 201 });
    if (url.pathname.endsWith('/status')) current.status = (await request.json()).status;
    if (url.pathname.endsWith('/comments')) {
      const body = await request.json();
      current.comments.push({ id: `c-${current.comments.length}`, text: body.text, kind: body.kind, createdAt: current.updatedAt, author: reference.assignees[0] });
      if (body.kind === 'clarification_request') current.status = 'awaiting_clarification';
      if (body.kind === 'clarification_response') current.status = 'in_review';
    }
    return Response.json(current);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const fields = () => [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('main input, main select, main textarea')];
const required = (element: Element) => element.hasAttribute('required') || element.getAttribute('aria-required') === 'true';
function politeText() {
  return [...document.querySelectorAll('[aria-live="polite"]')].map(element => element.textContent ?? '').join(' ');
}
function expectLabelled() {
  const unlabeled = fields().filter(element => element.labels === null || element.labels.length === 0).map(element => element.outerHTML.slice(0, 80));
  expect(unlabeled).toEqual([]);
}
function expectDescribedByAlert(field: HTMLElement) {
  expect(field.getAttribute('aria-invalid')).toBe('true');
  const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  const described = ids.map(id => document.getElementById(id)).filter((element): element is HTMLElement => element !== null);
  expect(described.some(element => element.closest('[role="alert"]') !== null)).toBe(true);
}
async function asManager(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await user.click(await screen.findByRole('link', { name: current.number }));
  await screen.findByRole('heading', { level: 1, name: `Обращение ${current.number}` });
  await screen.findByLabelText('Назначить ответственного');
}

describe('доступность форм', () => {
  it('у каждого поля подачи есть метка, обязательные поля помечены', async () => {
    open('/submit');
    await screen.findByRole('option', { name: 'Межотдельное взаимодействие' });
    expectLabelled();
    expect(required(screen.getByLabelText('Категория'))).toBe(true);
    expect(required(screen.getByLabelText('Описание'))).toBe(true);
  });

  it('у полей очереди, обработки и ответа автора есть метки, обязательные помечены', async () => {
    const user = userEvent.setup(); open('/my');
    await asManager(user);
    expectLabelled();
    expect(required(screen.getByLabelText('Назначить ответственного'))).toBe(true);
    await user.click(screen.getByRole('link', { name: 'К очереди' }));
    await screen.findByLabelText('Подразделение');
    expectLabelled();
    current.status = 'awaiting_clarification';
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'employee');
    await user.click(await screen.findByRole('link', { name: current.number }));
    const reply = await screen.findByLabelText('Ваш ответ на уточнение');
    expectLabelled();
    expect(required(reply)).toBe(true);
  });

  it('ошибка валидации подачи: фокус на первом невалидном поле, role=alert и aria-describedby', async () => {
    const user = userEvent.setup(); open('/submit');
    await screen.findByRole('option', { name: 'Межотдельное взаимодействие' });
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    const category = screen.getByLabelText('Категория');
    await waitFor(() => expect(document.activeElement).toBe(category));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expectDescribedByAlert(category);
    expectDescribedByAlert(screen.getByLabelText('Описание'));
  });

  it('ошибка валидации обработки: фокус на поле обоснования, оно связано с сообщением', async () => {
    const user = userEvent.setup(); open('/my');
    current.status = 'in_review';
    await asManager(user);
    await user.click(screen.getByRole('button', { name: 'Зафиксировать итог' }));
    const explanation = screen.getByLabelText('Обоснование решения');
    await waitFor(() => expect(document.activeElement).toBe(explanation));
    expect(screen.getByRole('alert').textContent).toMatch(/Объясните решение/);
    expectDescribedByAlert(explanation);
  });

  it('пустой ответ автора: фокус на поле ответа и role=alert', async () => {
    current.status = 'awaiting_clarification';
    const user = userEvent.setup(); open(`/my/${current.id}`);
    const reply = await screen.findByLabelText('Ваш ответ на уточнение');
    await user.click(screen.getByRole('button', { name: 'Отправить ответ' }));
    await waitFor(() => expect(document.activeElement).toBe(reply));
    expectDescribedByAlert(reply);
  });

  it('ошибка периода в фильтрах очереди связана с полями дат', async () => {
    const user = userEvent.setup(); open('/my');
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    const after = await screen.findByLabelText('Срок от');
    await user.type(after, '2026-12-10');
    await user.type(screen.getByLabelText('Срок до'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    await waitFor(() => expect(document.activeElement).toBe(after));
    expectDescribedByAlert(after);
  });
});

describe('сообщения об успехе', () => {
  it('подача: сообщение в aria-live=polite и фокус на заголовке результата', async () => {
    const user = userEvent.setup(); open('/submit');
    await screen.findByRole('option', { name: 'Межотдельное взаимодействие' });
    await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
    await user.type(screen.getByLabelText('Описание'), 'Не хватает параметров.');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Обращение зарегистрировано' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(politeText()).toContain(current.number);
  });

  it('смена статуса: сообщение в aria-live=polite и фокус на заголовке карточки', async () => {
    const user = userEvent.setup(); open('/my');
    await asManager(user);
    await user.click(screen.getByRole('button', { name: 'Начать рассмотрение' }));
    await waitFor(() => expect(politeText()).toMatch(/Статус обращения изменён/));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: `Обращение ${current.number}` })));
  });

  it('комментарий: сообщение в aria-live=polite и фокус на заголовке карточки', async () => {
    const user = userEvent.setup(); open('/my');
    await asManager(user);
    await user.type(screen.getByLabelText('Комментарий или вопрос'), 'Проверим на неделе.');
    await user.click(screen.getByRole('button', { name: 'Добавить комментарий' }));
    await waitFor(() => expect(politeText()).toMatch(/Комментарий добавлен/));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: `Обращение ${current.number}` })));
  });
});

describe('клавиатура и смысл без цвета', () => {
  it('первый Tab ведёт на ссылку «Перейти к содержимому», затем шапка и меню по порядку', async () => {
    const user = userEvent.setup(); open('/my');
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Перейти к содержимому' });
    expect(document.activeElement).toBe(skip);
    expect(skip.getAttribute('href')).toBe('#main');
    await user.tab();
    expect(document.activeElement?.textContent).toMatch(/Модус Трейд/);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Демонстрационная роль'));
    // #273: переключатель языка стоит в шапке сразу после выбора роли.
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Язык'));
    await user.tab();
    expect(document.activeElement).toBe(within(screen.getByRole('navigation', { name: 'Основное меню' })).getAllByRole('link')[0]);
    expect(document.getElementById('main')?.tagName).toBe('MAIN');
  });

  it('видимый фокус задан в стилях', () => {
    const css = readFileSync(resolve(existsSync(resolve('src/shell.css')) ? 'src/shell.css' : 'web/src/shell.css'), 'utf8');
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*\d+px\s+solid/);
  });

  it('статус и «просрочено» переданы текстом, а не только цветом', async () => {
    const user = userEvent.setup(); open('/my');
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    const item = (await screen.findByRole('link', { name: current.number })).closest('li')!;
    expect(within(item).getByText('Новое')).toBeTruthy();
    expect(within(item).getByText(/Просрочено/)).toBeTruthy();
    await user.click(screen.getByRole('link', { name: current.number }));
    await screen.findByRole('heading', { level: 1, name: `Обращение ${current.number}` });
    expect(screen.getByText(/Просрочено/)).toBeTruthy();
  });
});
