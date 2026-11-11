import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

const createObjectURL = vi.fn(() => 'blob:csv-regression');
let empty: boolean;
let exportedQuery: URLSearchParams;

beforeEach(() => {
  empty = false;
  createObjectURL.mockClear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json({ categories: [], departments: [], assignees: [] });
    if (url.pathname === '/complaints/export') {
      exportedQuery = url.searchParams;
      if (empty) return new Response(null, { status: 204 });
      const response = new Response('номер,тип\r\nA-001,Проблема\r\n');
      // Node fetch and DOM Blob can belong to different realms. Model that
      // explicitly, so the regression is detectable under Node 24 as well.
      Object.defineProperty(response, 'blob', { value: async () => new NodeBlob(['номер,тип\r\nA-001,Проблема\r\n'], { type: 'text/csv' }) });
      return response;
    }
    return Response.json({ items: [], total: 0, limit: 20, offset: 0, unreadCount: 0 });
  }));
});

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function openQueue() {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/queue?status=in_review&q=болт']}><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByLabelText('Поиск по номеру или тексту');
  return user;
}

it('#233 downloads a CSV Blob from another realm with the applied filters', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const user = await openQueue();
  await user.click(screen.getByRole('button', { name: 'Скачать CSV' }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(exportedQuery.get('status')).toBe('in_review');
  expect(exportedQuery.get('q')).toBe('болт');
  expect(exportedQuery.has('limit')).toBe(false);
});

it('#233 reports an empty export response and creates no download', async () => {
  empty = true;
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const user = await openQueue();
  await user.click(screen.getByRole('button', { name: 'Скачать CSV' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(click).not.toHaveBeenCalled();
  expect(createObjectURL).not.toHaveBeenCalled();
});
