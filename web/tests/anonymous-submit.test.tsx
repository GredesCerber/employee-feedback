import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { components } from '../src/api/client';

// #129: флажок «Подать анонимно». API (#123) мокается по контракту: anonymous в теле, AnonymousActor без id.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const base: components['schemas']['Complaint'] = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const own = { ...base, anonymous: true };
const managerView = {
  ...base, anonymous: true, author: { name: 'Аноним' },
  comments: [{ id: 'c-1', kind: 'comment', text: 'Проверяем.', createdAt: base.createdAt, author: { name: 'Автор (аноним)' } }],
};

let posted: Record<string, unknown>[];
let created: unknown;
let listItems: unknown[];
let detail: unknown;
beforeEach(() => {
  sessionStorage.clear(); // черновик формы подачи (#312 A2) не переходит между тестами
  posted = []; created = own; listItems = [own]; detail = managerView;
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/reference-data') return Response.json(reference);
    if (path === '/complaints' && request.method === 'POST') { posted.push(await request.json()); return Response.json(created, { status: 201 }); }
    if (path === '/complaints') return Response.json({ items: listItems, total: listItems.length, limit: 20, offset: 0 });
    if (path.startsWith('/complaints/')) return Response.json(detail);
    return Response.json({ items: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear(); });

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText('Категория'), reference.categories[0].id);
  await user.type(screen.getByLabelText('Описание'), 'Не работает принтер');
}

describe('#129 anonymous submission', () => {
  it('sends anonymous: true when the flag is checked and shows the «Анонимно» badge on the confirmation', async () => {
    const user = userEvent.setup();
    open('/submit');
    await fill(user);
    await user.click(screen.getByRole('checkbox', { name: /Подать анонимно/ }));
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(await screen.findByRole('heading', { name: 'Обращение зарегистрировано' })).toBeTruthy();
    expect(posted).toHaveLength(1);
    expect(posted[0]!.anonymous).toBe(true);
    expect(screen.getByText('Анонимно')).toBeTruthy();
  });

  it('keeps the flag off by default: no anonymous: true and no badge', async () => {
    created = { ...base };
    const user = userEvent.setup();
    open('/submit');
    await fill(user);
    expect((screen.getByRole('checkbox', { name: /Подать анонимно/ }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    await screen.findByRole('heading', { name: 'Обращение зарегистрировано' });
    expect(posted[0]!.anonymous).not.toBe(true);
    expect(screen.queryByText('Анонимно')).toBeNull();
  });

  it('explains the limits via an accessible description of the checkbox', async () => {
    open('/submit');
    const box = await screen.findByRole('checkbox', { name: /Подать анонимно/ });
    const ids = (box.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    const text = ids.map(id => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(text).toMatch(/ответственный не видит автора/i);
    expect(text).toMatch(/по тексту и вложениям/i);
    expect(text).toMatch(/узнать/i);
  });

  it('marks the anonymous complaint «Анонимно» in «Мои обращения» and in the author card', async () => {
    listItems = [own, { ...base, id: 'other', number: 'A-099', anonymous: false }];
    open('/my');
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]!).getByText('Анонимно')).toBeTruthy();
    expect(within(items[1]!).queryByText('Анонимно')).toBeNull();
    cleanup();
    detail = own;
    open(`/my/${own.id}`);
    expect(await screen.findByText('Анонимно')).toBeTruthy();
  });

  it('shows the manager «Аноним» instead of the author, with no profile links, in card, comments and queue', async () => {
    listItems = [managerView];
    const user = userEvent.setup();
    open('/queue');
    await user.selectOptions(await screen.findByLabelText('Демонстрационная роль'), 'manager');
    await user.click(await screen.findByRole('link', { name: managerView.number }));
    expect(await screen.findByText('Автор (аноним)')).toBeTruthy();
    const author = screen.getByText('Автор').parentElement!;
    expect(author.textContent).toContain('Аноним');
    expect(author.querySelector('a')).toBeNull();
    expect(screen.queryByText(base.author.name)).toBeNull();
    await user.click(screen.getByRole('link', { name: 'К очереди' }));
    expect(await screen.findByRole('link', { name: managerView.number })).toBeTruthy();
  });
});
