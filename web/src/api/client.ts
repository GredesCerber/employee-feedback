import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

type ErrorDetails = components['schemas']['Error']['details'];
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: ErrorDetails) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(options: { userId: string; baseUrl?: string; fetch?: (request: Request) => Promise<Response> }) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? (import.meta.env.VITE_API_BASE_URL || '/api'),
    fetch: options.fetch,
  });
  client.use({
    onRequest({ request }) {
      request.headers.set('X-Demo-User', options.userId);
      return request;
    },
    async onResponse({ response }) {
      if (response.ok) return response;
      let body: unknown;
      try { body = await response.clone().json(); } catch { /* Non-JSON proxy errors use the safe fallback below. */ }
      if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' && 'message' in body && typeof body.message === 'string') {
        const details = 'details' in body && Array.isArray(body.details)
          ? body.details.filter((item): item is { field: string; message: string } => typeof item === 'object' && item !== null && typeof item.field === 'string' && typeof item.message === 'string') : undefined;
        throw new ApiError(response.status, body.code, body.message, details);
      }
      throw new ApiError(response.status, 'HTTP_ERROR', `Не удалось выполнить запрос (${response.status}). Повторите попытку.`);
    },
    onError() {
      return new ApiError(0, 'NETWORK_ERROR', 'Нет связи с сервером. Проверьте подключение и повторите попытку.');
    },
  });
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { components, paths } from './schema';
