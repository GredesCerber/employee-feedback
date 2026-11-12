import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';
import { answerDaysLabel, myFiltersFromUrl, myFiltersToQuery, myFiltersToUrl } from '../src/features/myComplaintsFilters';

// #312 A7: поиск и фильтр по статусу в «Моих обращениях»; A9: пустое состояние с объяснением.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const make = (number: string, status: Complaint['status'], description: string): Complaint =>
  ({ ...structuredClone(example), id: `my-${number}`, number, status, description });

let records: Complaint[];
let listQueries: URLSearchParams[];
let referenceBody: unknown;
let location = '';

function LocationProbe() {
  const current = useLocation();
  location = current.pathname + current.search;
  return null;
}

beforeEach(() => {
  records = [make('M-1', 'new', 'Сломан принтер на третьем этаже'), make('M-2', 'closed', 'Спасибо за новую столовую'), make('M-3', 'new', 'Предлагаю гибкий график')];
  listQueries = []; referenceBody = reference; location = '';
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(referenceBody);
    if (url.pathname === '/complaints') {
      const query = url.searchParams; listQueries.push(query);
      const q = query.get('q')?.toLowerCase() ?? '';
      const filtered = records.filter(item => (!query.get('status') || item.status === query.get('status'))
        && (!q || `${item.number} ${item.description}`.toLowerCase().includes(q)));
      return Response.json({ items: filtered, total: filtered.length, limit: 20, offset: 0 });
    }
    return Response.json({ code: 'NOT_FOUND', message: 'Неизвестный маршрут' }, { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function open(entry = '/my') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[entry]}><App /><LocationProbe /></MemoryRouter>);
  return user;
}

describe('#312 A7 URL helpers', () => {
  it('reads known status and trimmed search, drops unknown values', () => {
    expect(myFiltersFromUrl(new URLSearchParams('status=closed&q=  принтер '))).toEqual({ status: 'closed', q: 'принтер' });
    expect(myFiltersFromUrl(new URLSearchParams('status=bogus&q=%20%20'))).toEqual({ status: '', q: '' });
    expect(myFiltersFromUrl(new URLSearchParams(`q=${'я'.repeat(250)}`)).q).toHaveLength(200);
  });

  it('writes only non-empty filters and passes them to the contract query', () => {
    expect(myFiltersToUrl({ status: '', q: ' ' }).toString()).toBe('');
    expect(myFiltersToUrl({ status: 'new', q: 'M-1' }).toString()).toBe('status=new&q=M-1');
    expect(myFiltersToQuery({ status: 'new', q: ' M-1 ' }, 20)).toEqual({ limit: 20, offset: 20, status: 'new', q: 'M-1' });
    expect(myFiltersToQuery({ status: '', q: '' }, 0)).toEqual({ limit: 20, offset: 0 });
  });

  it('builds the response time from category rules', () => {
    expect(answerDaysLabel([{ dueInDays: 7 }, { dueInDays: 7 }])).toBe('7');
    expect(answerDaysLabel([{ dueInDays: 10 }, { dueInDays: 3 }])).toBe('3–10');
    expect(answerDaysLabel([])).toBeNull();
    expect(answerDaysLabel(undefined)).toBeNull();
  });
});

describe('#312 A7 filter and search in «Мои обращения»', () => {
  it('filters by status through the API, keeps it in the URL and shows the count', async () => {
    const user = open();
    expect(await screen.findByText('Всего обращений: 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сбросить' })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Статус'), 'closed');
    expect(await screen.findByText('Найдено: 1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'M-2' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'M-1' })).toBeNull();
    expect(location).toBe('/my?status=closed');
    expect(listQueries.at(-1)?.get('status')).toBe('closed');
  });

  it('searches by number or text after a short pause', async () => {
    const user = open();
    await screen.findByText('Всего обращений: 3');
    await user.type(screen.getByLabelText('Поиск по номеру или тексту'), 'принтер');
    expect(await screen.findByText('Найдено: 1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'M-1' })).toBeTruthy();
    expect(location).toBe(`/my?q=${encodeURIComponent('принтер')}`);
    expect(listQueries.at(-1)?.get('q')).toBe('принтер');
  });

  it('restores filters from the URL and resets them with «Сбросить»', async () => {
    const user = open('/my?status=new&q=M-3');
    expect(await screen.findByText('Найдено: 1')).toBeTruthy();
    expect((screen.getByLabelText('Статус') as HTMLSelectElement).value).toBe('new');
    expect((screen.getByLabelText('Поиск по номеру или тексту') as HTMLInputElement).value).toBe('M-3');
    await user.click(within(screen.getByRole('search')).getByRole('button', { name: 'Сбросить' }));
    expect(await screen.findByText('Всего обращений: 3')).toBeTruthy();
    expect(location).toBe('/my');
    expect((screen.getByLabelText('Поиск по номеру или тексту') as HTMLInputElement).value).toBe('');
  });

  it('explains an empty result and offers to reset, without the first-complaint intro', async () => {
    const user = open('/my?q=nothing');
    expect(await screen.findByText('По запросу «nothing» обращений не найдено.')).toBeTruthy();
    expect(screen.getByText('Найдено: 0')).toBeTruthy();
    expect(screen.queryByText('У вас пока нет обращений.')).toBeNull();
    const buttons = screen.getAllByRole('button', { name: 'Сбросить' });
    await user.click(buttons[buttons.length - 1]!);
    expect(await screen.findByText('Всего обращений: 3')).toBeTruthy();
  });

  it('shows a status-specific message when no complaint has the chosen status', async () => {
    open('/my?status=rejected');
    expect(await screen.findByText('Обращений с выбранным статусом нет.')).toBeTruthy();
  });
});

describe('#312 A9 empty state for an employee without complaints', () => {
  it('explains what a complaint is, who answers and the deadline from category rules', async () => {
    records = [];
    open();
    const intro = await screen.findByRole('region', { name: 'У вас пока нет обращений.' });
    expect(within(intro).getByText('Что такое обращение')).toBeTruthy();
    expect(within(intro).getByText('Кто ответит')).toBeTruthy();
    const days = answerDaysLabel(reference.categories)!;
    expect(await within(intro).findByText(new RegExp(`в календарных днях с момента подачи: ${days.replace('–', '.')}\\.`))).toBeTruthy();
    expect(within(intro).getByRole('link', { name: 'Подать обращение' }).getAttribute('href')).toBe('/submit');
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('falls back to general wording without numbers when the rules are unavailable', async () => {
    records = []; referenceBody = { departments: [], categories: [] };
    open();
    expect(await screen.findByText('Срок ответа задаёт категория. Точная дата появится в карточке обращения сразу после подачи.')).toBeTruthy();
  });

  it('keeps the search when filters hide every complaint', async () => {
    records = [];
    open('/my?status=new');
    expect(await screen.findByText('Обращений с выбранным статусом нет.')).toBeTruthy();
    expect(screen.getByRole('search')).toBeTruthy();
  });
});

it('#312 A7 search waits for typing to settle', async () => {
  const user = open();
  await screen.findByText('Всего обращений: 3');
  const before = listQueries.length;
  await user.type(screen.getByLabelText('Поиск по номеру или тексту'), 'M-');
  await waitFor(() => expect(listQueries.length).toBe(before + 1));
});
