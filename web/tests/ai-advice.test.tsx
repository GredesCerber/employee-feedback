import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

// «Помощь ИИ» на карточке: компактная кнопка, 2–3 варианта с плюсами и минусами, источник ответа виден.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const advice = { source: 'llm', options: [
  { title: 'Взять в работу', summary: 'Перевести в работу и назвать срок.', pros: ['Автор видит движение'], cons: ['Нужны ресурсы'] },
  { title: 'Запросить уточнение', summary: 'Задать автору вопрос.', pros: ['Меньше ошибок'], cons: ['Дольше'] },
] };
let adviceCalls: Request[];
let adviceResponse: () => Response;

beforeEach(() => {
  adviceCalls = [];
  adviceResponse = () => Response.json(advice);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints') return Response.json({ items: [example], total: 1, limit: 20, offset: 0 });
    if (url.pathname.endsWith('/advice')) { adviceCalls.push(request); return adviceResponse(); }
    return Response.json(example);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openCard(role: 'employee' | 'manager') {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  await user.click(await screen.findByRole('link', { name: example.number }));
  await screen.findByRole('heading', { name: `Обращение ${example.number}` });
  return user;
}

describe('«Помощь ИИ» на карточке обращения', () => {
  it('по кнопке спрашивает сервер и показывает варианты с плюсами, минусами и источником', async () => {
    const user = await openCard('manager');
    const button = screen.getByRole('button', { name: /Помощь ИИ/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(adviceCalls).toHaveLength(0);
    await user.click(button);
    const panel = await screen.findByRole('region', { name: 'Варианты решения' });
    expect(adviceCalls).toHaveLength(1);
    expect(adviceCalls[0]!.method).toBe('POST');
    expect(new URL(adviceCalls[0]!.url).pathname).toBe(`/complaints/${example.id}/advice`);
    const options = await within(panel).findAllByRole('heading', { level: 3 });
    expect(options.map(node => node.textContent)).toEqual(['Взять в работу', 'Запросить уточнение']);
    expect(within(panel).getByText('Автор видит движение')).toBeTruthy();
    expect(within(panel).getByText('Нужны ресурсы')).toBeTruthy();
    expect(within(panel).getByText('ИИ')).toBeTruthy();
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('при ошибке сервера показывает понятное сообщение, а не пустую панель', async () => {
    adviceResponse = () => Response.json({ code: 'INTERNAL', message: 'x', requestId: 'r' }, { status: 500 });
    const user = await openCard('employee');
    await user.click(screen.getByRole('button', { name: /Помощь ИИ/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/недоступна/);
  });

  it('ответ по правилам помечен «Правила (без ИИ)»', async () => {
    adviceResponse = () => Response.json({ ...advice, source: 'rules' });
    const user = await openCard('employee');
    await user.click(screen.getByRole('button', { name: /Помощь ИИ/ }));
    expect(await screen.findByText('Правила (без ИИ)')).toBeTruthy();
  });
});
