import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

// #204: согласованные подписи в карточке обращения.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
let current: Complaint;

function stub() {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints') return Response.json({ items: [current], total: 1, limit: 20, offset: 0 });
    return Response.json(current);
  }));
}
beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openCard(role: 'employee' | 'manager', hints = false) {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  if (hints && !(screen.getByRole('checkbox', { name: 'Подсказки демо' }) as HTMLInputElement).checked) await user.click(screen.getByRole('checkbox', { name: 'Подсказки демо' }));
  await user.click(await screen.findByRole('link', { name: current.number }));
  await screen.findByRole('heading', { name: `Обращение ${current.number}` });
  return user;
}

describe('#204 подписи карточки', () => {
  it('первая опция списка ответственных совпадает с подписью поля', async () => {
    current = { ...structuredClone(example), status: 'in_review' };
    stub();
    await openCard('manager');
    const select = await screen.findByLabelText('Назначить ответственного');
    expect((select as HTMLSelectElement).options[0]!.textContent).toBe('Назначить ответственного');
  });

  it('для нового обращения «Отклонено» сопровождается пояснением «сначала начните рассмотрение»', async () => {
    current = { ...structuredClone(example), status: 'new' };
    stub();
    await openCard('manager');
    const outcome = await screen.findByLabelText('Итог рассмотрения') as HTMLSelectElement;
    expect([...outcome.options].map(o => o.textContent)).toEqual(['Отклонено']);
    expect(screen.getByText(/сначала начните рассмотрение/i)).toBeTruthy();
  });

  it('при отказе поле объяснения подписано «Мотивированный отказ»', async () => {
    current = { ...structuredClone(example), status: 'in_review' };
    stub();
    const user = await openCard('manager');
    const outcome = await screen.findByLabelText('Итог рассмотрения');
    await user.selectOptions(outcome, 'rejected');
    expect(screen.getByLabelText('Мотивированный отказ')).toBeTruthy();
    await user.selectOptions(outcome, 'implemented');
    expect(screen.queryByLabelText('Мотивированный отказ')).toBeNull();
    expect(screen.getByLabelText('Обоснование решения')).toBeTruthy();
  });

  it('подсказка демо на /my/:id: шаг 2 без итога и шаг 4 с решением', async () => {
    current = { ...structuredClone(example), status: 'new' };
    stub();
    await openCard('employee', true);
    await waitFor(() => expect(screen.getByRole('note', { name: 'Подсказка демо' }).textContent).toMatch(/Шаг 2 из 6/));
    cleanup();
    current = { ...structuredClone(example), status: 'rejected', decision: { outcome: 'rejected', explanation: 'Причина', author: { id: 'u', name: 'Руководитель' }, createdAt: '2026-11-10T10:00:00Z' } } as Complaint;
    await openCard('employee', true);
    expect((await screen.findByRole('note', { name: 'Подсказка демо' })).textContent).toMatch(/Шаг 4 из 6/);
  });
});
