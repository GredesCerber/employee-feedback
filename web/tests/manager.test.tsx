import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
let current: Complaint;
let requests: Request[];
let failMutation: boolean;

beforeEach(() => {
  current = { ...structuredClone(example), status: 'in_review', overdue: true };
  requests = []; failMutation = false;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(request.clone());
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (request.method !== 'GET' && failMutation) return Response.json({ code: 'INVALID_TRANSITION', message: 'Обращение уже изменилось. Обновите карточку.' }, { status: 409 });
    if (url.pathname.endsWith('/assignment')) {
      current.assignee = reference.assignees[0];
      current.routing = { queue: 'assigned', reason: 'manual_assignment' };
      current.history.push({ ...current.history[0]!, id: 'assignment-new', kind: 'assigned', text: 'Назначен руководитель.' });
    } else if (url.pathname.endsWith('/comments')) {
      const body = await request.json();
      current.comments.push({ id: `comment-${current.comments.length}`, text: body.text, kind: body.kind, createdAt: current.updatedAt, author: body.kind === 'clarification_response' ? current.author : reference.assignees[0] });
      current.status = body.kind === 'clarification_request' ? 'awaiting_clarification' : body.kind === 'clarification_response' ? 'in_review' : current.status;
      current.nextAction = current.status === 'awaiting_clarification' ? 'Автору нужно ответить на запрос уточнения.' : 'Ответственный рассматривает обращение.';
    } else if (url.pathname.endsWith('/decision')) {
      const body = await request.json();
      current.status = body.outcome;
      current.decision = { ...body, actions: body.actions ?? null, author: reference.assignees[0], createdAt: current.updatedAt };
      current.nextAction = 'Рассмотрение завершено. Ознакомьтесь с решением.';
      current.overdue = false;
    } else if (url.pathname.endsWith('/status')) {
      current.status = (await request.json()).status;
    }
    if (url.pathname === '/complaints') {
      const other = { ...current, id: 'complaint-other', number: 'A-999', departmentId: 'accounting', status: 'in_progress' };
      const items = [current, other].filter(item =>
        (!url.searchParams.get('departmentId') || item.departmentId === url.searchParams.get('departmentId')) &&
        (!url.searchParams.get('categoryId') || item.categoryId === url.searchParams.get('categoryId')) &&
        (!url.searchParams.get('status') || item.status === url.searchParams.get('status')) &&
        (!url.searchParams.get('queue') || item.routing.queue === url.searchParams.get('queue')));
      return Response.json({ items, total: items.length, limit: 20, offset: 0 });
    }
    return Response.json(current, { status: request.method === 'POST' ? 201 : 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openManager() {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByRole('link', { name: current.number });
  return user;
}
async function openCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('link', { name: current.number }));
  await screen.findByRole('heading', { name: `Обращение ${current.number}` });
}
async function asAuthor(user: ReturnType<typeof userEvent.setup>) {
  // После #203 смена роли с открытой карточки сразу открывает ту же карточку у автора (/queue/:id → /my/:id).
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'employee');
  await screen.findByRole('heading', { name: `Обращение ${current.number}` });
}

describe('manager queue acceptance', () => {
  it('combines department category status and date filters and labels overdue records with a date', async () => {
    const user = await openManager();
    await user.selectOptions(screen.getByLabelText('Подразделение'), 'procurement');
    await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
    await user.selectOptions(screen.getByLabelText('Статус'), 'in_review');
    await user.type(screen.getByLabelText('Срок до'), '2026-11-20');
    await user.click(screen.getByLabelText('Только просроченные'));
    await user.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'A-999' })).toBeNull());
    expect(await screen.findByRole('link', { name: current.number })).toBeTruthy();
    expect(screen.getByText(/Просрочено · срок/).textContent).toMatch(/2026/);
    const request = requests.filter(request => new URL(request.url).pathname === '/complaints').at(-1)!;
    const params = new URL(request.url).searchParams;
    expect(params.get('departmentId')).toBe('procurement');
    expect(params.get('categoryId')).toBe('cross_department');
    expect(params.get('status')).toBe('in_review');
    expect(params.get('overdue')).toBe('true');
    expect(params.get('dueBefore')).toContain('2026-11-20');
  });

  it('assigns an unowned complaint and exposes the resulting history and ordinary queue membership', async () => {
    current.assignee = null; current.routing = { queue: 'unassigned', reason: 'no_rule' };
    const user = await openManager(); await openCard(user);
    await user.selectOptions(await screen.findByLabelText('Назначить ответственного'), 'manager-1');
    await user.click(screen.getByRole('button', { name: 'Назначить' }));
    expect(await screen.findByText('Назначен руководитель.')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'К очереди' }));
    await user.selectOptions(await screen.findByLabelText('Очередь'), 'assigned');
    await user.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    expect(await screen.findByRole('link', { name: current.number })).toBeTruthy();
    expect(current.routing.queue).toBe('assigned');
  });

  it('shows a clarification request to its author and accepts the author response', async () => {
    const user = await openManager(); await openCard(user);
    await user.type(screen.getByLabelText('Комментарий или вопрос'), 'Уточните номер заявки.');
    await user.click(screen.getByRole('button', { name: 'Запросить уточнение' }));
    await screen.findByText('Ожидает уточнения');
    await asAuthor(user);
    expect(screen.getAllByText('Уточните номер заявки.').length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText('Ваш ответ на уточнение'), 'Номер заявки 123.');
    await user.click(screen.getByRole('button', { name: 'Отправить уточнение' }));
    expect(await screen.findByText('Номер заявки 123.')).toBeTruthy();
    expect(screen.getByText('На рассмотрении')).toBeTruthy();
    expect(screen.queryByLabelText('Ваш ответ на уточнение')).toBeNull();
    const responseRequest = requests.filter(request => request.method === 'POST').at(-1)!;
    expect(responseRequest.headers.get('X-Demo-User')).toBe('employee-1');
    expect((await responseRequest.json()).kind).toBe('clarification_response');
  });

  it.each([['implemented', 'Реализовано'], ['rejected', 'Отклонено']] as const)('records %s with a reason visible in the author card', async (outcome, label) => {
    const user = await openManager(); await openCard(user);
    await user.selectOptions(screen.getByLabelText('Итог рассмотрения'), outcome);
    await user.type(screen.getByLabelText('Обоснование решения'), 'Результат рассмотрения с понятным объяснением.');
    await user.click(screen.getByRole('button', { name: 'Зафиксировать итог' }));
    await screen.findByRole('heading', { name: 'Итог рассмотрения' });
    await asAuthor(user);
    expect(screen.getByText('Результат рассмотрения с понятным объяснением.')).toBeTruthy();
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Зафиксировать итог' })).toBeNull();
  });

  it('keeps the text and reports a failed mutation without showing a false decision', async () => {
    failMutation = true;
    const user = await openManager(); await openCard(user);
    await user.type(screen.getByLabelText('Обоснование решения'), 'Сохранить это объяснение.');
    await user.click(screen.getByRole('button', { name: 'Зафиксировать итог' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Обоснование решения') as HTMLTextAreaElement).value).toBe('Сохранить это объяснение.');
    expect(current.decision).toBeNull();
  });

  it('offers only contract transitions and advances new to review then work', async () => {
    current.status = 'new';
    const user = await openManager(); await openCard(user);
    expect(screen.queryByRole('option', { name: 'Реализовано' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Начать рассмотрение' }));
    await screen.findByText('На рассмотрении');
    await user.click(screen.getByRole('button', { name: 'Взять в работу' }));
    expect(await screen.findByText('В работе')).toBeTruthy();
    expect(requests.filter(request => new URL(request.url).pathname.endsWith('/status'))).toHaveLength(2);
  });
});
