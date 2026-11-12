// #312 B2 / аудит Г7: в колокольчике видны смена статуса (автор) и просрочка (руководитель) с пометкой «Просрочено».
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { notificationText } from '../src/i18n';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const reference = contract.components.schemas.ReferenceData.examples[0];
const DISCLAIMER = 'Имитация: в промышленной версии email / Битрикс24';
const base = { complaintId: 'c1', complaintNumber: 'A-001', createdAt: '2026-11-10T10:00:00.000Z', simulated: true, disclaimer: DISCLAIMER };
const feeds: Record<string, unknown[]> = {
  'employee-1': [{ ...base, id: 'status-changed-1', kind: 'status_changed', message: 'Обращение A-001 взято в работу.', href: '/my/c1' }],
  'manager-1': [{ ...base, id: 'overdue-1', kind: 'overdue', complaintId: 'c2', complaintNumber: 'A-002',
    message: 'Срок рассмотрения обращения A-002 истёк.', href: '/queue/c2' }],
};

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom */ }
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/notifications') {
      const items = feeds[request.headers.get('X-Demo-User') ?? ''] ?? [];
      return Response.json({ items, unreadCount: items.length, generatedAt: '2026-11-11T00:00:00.000Z' });
    }
    if (url.pathname === '/reference-data') return Response.json(reference);
    return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('#312 уведомления о смене статуса и просрочке', () => {
  it('контракт перечисляет новые виды событий', () => {
    expect(contract.components.schemas.Notification.properties.kind.enum).toEqual(expect.arrayContaining(['status_changed', 'overdue']));
  });

  it('автор видит, что обращение взято в работу, со ссылкой на карточку', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /Уведомления.*1/ }));
    expect(screen.getByRole('link', { name: 'Обращение A-001 взято в работу.' }).getAttribute('href')).toBe('/my/c1');
    expect(screen.queryByText('Просрочено')).toBeNull();
  });

  it('руководитель видит просрочку с пометкой «Просрочено»', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
    await screen.findByRole('button', { name: /Уведомления/ });
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    await user.click(await screen.findByRole('button', { name: /Уведомления.*1/ }));
    expect(screen.getByRole('link', { name: 'Срок рассмотрения обращения A-002 истёк.' }).getAttribute('href')).toBe('/queue/c2');
    expect(screen.getByText('Просрочено').className).toBe('notification-kind-overdue');
  });

  it('новые тексты переводятся на английский и казахский', () => {
    expect(notificationText('en', 'Срок рассмотрения обращения A-002 истёк.')).toBe('Request A-002 is overdue.');
    expect(notificationText('en', 'Обращение A-001 взято в работу.')).toBe('Request A-001 is now in progress.');
    expect(notificationText('en', 'Обращение A-001 принято на рассмотрение.')).toBe('Request A-001 is now under review.');
    expect(notificationText('kk', 'Обращение A-001 взято в работу.')).toBe('A-001 өтініші жұмысқа алынды.');
  });
});
