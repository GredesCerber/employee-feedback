import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/api/client';

describe('contract client', () => {
  it('uses the selected demo identity and serializes contract filters', async () => {
    const fetcher = vi.fn(async (_request: Request) => Response.json({ items: [], total: 0, limit: 20, offset: 0 }));
    const client = createApiClient({ userId: 'manager-1', baseUrl: 'http://localhost:3000', fetch: fetcher });
    const result = await client.GET('/complaints', { params: { query: { overdue: true, categoryId: 'cross_department' } } });
    const request = fetcher.mock.calls[0]?.[0] as Request;
    expect(request.headers.get('X-Demo-User')).toBe('manager-1');
    expect(request.headers.has('X-Role')).toBe(false);
    expect(new URL(request.url).searchParams.get('overdue')).toBe('true');
    expect(new URL(request.url).searchParams.get('categoryId')).toBe('cross_department');
    expect(result.data?.items).toEqual([]);
  });

  it('preserves API validation errors without reporting success', async () => {
    const client = createApiClient({ userId: 'employee-1', baseUrl: 'http://localhost:3000', fetch: async () => Response.json({ code: 'VALIDATION_ERROR', message: 'Укажите категорию', details: [{ field: 'categoryId', message: 'Обязательное поле' }] }, { status: 422 }) });
    await expect(client.POST('/complaints', { body: { type: 'problem', categoryId: '', description: 'Текст' } })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR', message: 'Укажите категорию', details: [{ field: 'categoryId', message: 'Обязательное поле' }] });
  });

  it('handles non-JSON server errors and network failures explicitly', async () => {
    const broken = createApiClient({ userId: 'employee-1', baseUrl: 'http://localhost:3000', fetch: async () => new Response('<html>upstream failed</html>', { status: 502 }) });
    await expect(broken.GET('/session')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
    const offline = createApiClient({ userId: 'employee-1', baseUrl: 'http://localhost:3000', fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(offline.GET('/session')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
