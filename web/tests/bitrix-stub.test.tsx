import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';

// #291: у принятого обращения руководитель видит имитацию «Создать задачу в Битрикс24» без сетевых запросов.
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
const implemented = (): Complaint => ({
  ...structuredClone(example),
  status: 'implemented',
  decision: { outcome: 'implemented', explanation: 'Сделано', actions: null, author: { id: 'u-1', name: 'Руководитель' }, createdAt: '2026-11-10T10:00:00Z' },
} as unknown as Complaint);

let item: Complaint;
let requests: { method: string; path: string }[];
beforeEach(() => {
  requests = [];
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    requests.push({ method: request.method, path: url.pathname });
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname.startsWith('/complaints/')) return Response.json(item);
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openComplaint(role: 'manager' | 'employee') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[`/queue/${item.id}`]}><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  await screen.findByRole('heading', { name: 'Итог рассмотрения', level: 2 }).catch(() => null);
  return user;
}

describe('#291 Bitrix24 task imitation', () => {
  it('manager sees the button on an implemented complaint with an imitation mark', async () => {
    item = implemented();
    await openComplaint('manager');
    expect(await screen.findByRole('button', { name: 'Создать задачу в Битрикс24' })).toBeTruthy();
    expect(screen.getByText('Планируется интеграция')).toBeTruthy();
  });

  it('click shows the stub message and sends no requests', async () => {
    item = implemented();
    const user = await openComplaint('manager');
    await user.click(await screen.findByRole('button', { name: 'Создать задачу в Битрикс24' }));
    expect(await screen.findByText('Интеграция с Битрикс24 запланирована. В демо задача не отправляется')).toBeTruthy();
    expect(requests.filter(request => request.method !== 'GET')).toHaveLength(0);
  });

  it('no button when the complaint is not implemented', async () => {
    item = { ...example, status: 'in_progress' } as Complaint;
    await openComplaint('manager');
    await waitFor(() => expect(screen.getByRole('heading', { name: /.+/, level: 1 })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Создать задачу в Битрикс24' })).toBeNull();
  });

  it('no button for employee on an implemented complaint', async () => {
    item = implemented();
    await openComplaint('employee');
    await waitFor(() => expect(screen.getByRole('heading', { name: /.+/, level: 1 })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Создать задачу в Битрикс24' })).toBeNull();
  });
});
