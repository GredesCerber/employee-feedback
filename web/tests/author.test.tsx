import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const complaint: components['schemas']['Complaint'] = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const rejected = { ...complaint, status: 'rejected', nextAction: 'Ознакомьтесь с причиной отказа.', decision: { outcome: 'rejected', explanation: 'Нет подходящего помещения.', actions: 'Вернуться к вопросу при перепланировке.', author: complaint.assignee, createdAt: complaint.createdAt } };
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
let requests: Request[];
let failCreate: boolean;
let failList: boolean;
let emptyList: boolean;

beforeEach(() => {
  requests = []; failCreate = false; failList = false; emptyList = false;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (path === '/reference-data') return Response.json(reference);
    if (path === '/complaints' && request.method === 'POST') return failCreate
      ? Response.json({ code: 'INTERNAL_ERROR', message: 'Сервис временно недоступен' }, { status: 500 })
      : Response.json(complaint, { status: 201 });
    if (path === '/complaints') return failList
      ? Response.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить обращения' }, { status: 500 })
      : Response.json({ items: emptyList ? [] : [rejected], total: emptyList ? 0 : 1, limit: 20, offset: 0 });
    if (path === `/complaints/${complaint.id}`) return Response.json(rejected);
    return Response.json({ code: 'NOT_FOUND', message: 'Обращение не найдено' }, { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('author journey', () => {
  it('submits the required fields and shows the server registration number with a card link', async () => {
    const user = userEvent.setup(); open('/submit');
    await screen.findByRole('option', { name: 'Межотдельное взаимодействие' });
    await user.selectOptions(screen.getByLabelText('Тип обращения'), 'problem');
    await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
    await user.type(screen.getByLabelText('Описание'), 'В заявках не хватает параметров.');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(await screen.findByRole('heading', { name: 'Обращение зарегистрировано' })).toBeTruthy();
    expect(screen.getByText(complaint.number)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Открыть обращение' }).getAttribute('href')).toBe(`/my/${complaint.id}`);
    const request = requests.find(item => item.method === 'POST');
    expect(request?.headers.get('X-Demo-User')).toBe('employee-1');
    expect(await request?.json()).toEqual({ type: 'problem', categoryId: 'cross_department', description: 'В заявках не хватает параметров.' });
  });

  it('opens an author card with status, next step, history and an explained refusal', async () => {
    const user = userEvent.setup(); open('/my');
    await user.click(await screen.findByRole('link', { name: complaint.number }));
    expect(await screen.findByRole('heading', { name: `Обращение ${complaint.number}` })).toBeTruthy();
    expect(screen.getAllByText('Отклонено').length).toBeGreaterThan(0);
    expect(screen.getByText(rejected.nextAction)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'История обращения' })).toBeTruthy();
    expect(screen.getByText('Обращение зарегистрировано.')).toBeTruthy();
    expect(screen.getByText(rejected.decision.explanation)).toBeTruthy();
    expect(screen.getByText(rejected.decision.actions)).toBeTruthy();
  });

  it('preserves entered fields after a failed submission and permits a retry', async () => {
    failCreate = true; const user = userEvent.setup(); open('/submit');
    await screen.findByRole('option', { name: 'Межотдельное взаимодействие' });
    await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
    await user.type(screen.getByLabelText('Описание'), 'Сохраните мой текст.');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Описание') as HTMLTextAreaElement).value).toBe('Сохраните мой текст.');
    expect(screen.queryByText(complaint.number)).toBeNull();
    failCreate = false;
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(await screen.findByText(complaint.number)).toBeTruthy();
  });

  it('rejects whitespace-only descriptions without sending a create request', async () => {
    const user = userEvent.setup(); open('/submit');
    await screen.findByRole('option', { name: 'Межотдельное взаимодействие' });
    await user.selectOptions(screen.getByLabelText('Категория'), 'cross_department');
    await user.type(screen.getByLabelText('Описание'), '   ');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(await screen.findByText('Опишите проблему или предложение.')).toBeTruthy();
    expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
  });

  it('distinguishes loading failure from an empty list and retries', async () => {
    failList = true; const user = userEvent.setup(); open('/my');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('У вас пока нет обращений.')).toBeNull();
    failList = false; emptyList = true;
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('У вас пока нет обращений.')).toBeTruthy();
  });

  it('handles a missing or inaccessible card without exposing another complaint', async () => {
    open('/my/missing');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(complaint.description)).toBeNull();
    await waitFor(() => expect(screen.getByRole('link', { name: 'К моим обращениям' })).toBeTruthy());
  });
});
