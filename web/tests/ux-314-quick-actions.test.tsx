import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

// #314: четыре действия на главной сотрудника; #317: срок по категории в блоке «Что будет дальше»; B1: «Предложить идею».
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];

beforeEach(() => {
  sessionStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints') return Response.json({ items: [example], total: 1, limit: 20, offset: 0 });
    return Response.json({ code: 'NOT_FOUND', message: 'нет' }, { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const open = (entry: string) => render(<MemoryRouter initialEntries={[entry]}><App /></MemoryRouter>);

describe('#314 быстрые действия', () => {
  it('показывает четыре ссылки с нужными адресами', async () => {
    open('/my');
    const nav = await screen.findByRole('navigation', { name: 'Быстрые действия' });
    const hrefs = Array.from(nav.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/submit', '/submit?type=suggestion', '/my?status=awaiting_clarification', '/about']);
  });

  it('«Предложить идею» открывает форму с типом «Предложение»', async () => {
    open('/submit?type=suggestion');
    const select = await screen.findByLabelText('Тип обращения') as HTMLSelectElement;
    expect(select.value).toBe('suggestion');
  });

  it('срок в «Что будет дальше» появляется после выбора категории', async () => {
    const user = userEvent.setup();
    open('/submit');
    expect(await screen.findByText('Выберите категорию, чтобы увидеть срок')).toBeTruthy();
    const category = reference.categories[0];
    await user.selectOptions(await screen.findByLabelText('Категория'), category.id);
    await waitFor(() => expect(screen.getByText(`Срок первого ответа по выбранной категории: ${category.dueInDays} календарных дней от подачи.`)).toBeTruthy());
  });
});
