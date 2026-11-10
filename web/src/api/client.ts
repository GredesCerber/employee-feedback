import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

type ErrorDetails = components['schemas']['Error']['details'];
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: ErrorDetails, public readonly retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Retry-After: секунды или HTTP-дата. Без заголовка ждём 5 с, сверху ограничиваем минутой. */
export function parseRetryAfter(header: string | null, now = Date.now()): number {
  if (header) {
    const seconds = Number(header.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60, Math.max(1, Math.ceil(seconds)));
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.min(60, Math.max(1, Math.ceil((date - now) / 1000)));
  }
  return 5;
}

export const tooManyRequests = (seconds: number) => `Слишком много запросов, повторите через ${seconds} с`;

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
      if (response.status === 429) {
        const seconds = parseRetryAfter(response.headers.get('Retry-After'));
        throw new ApiError(429, 'RATE_LIMITED', tooManyRequests(seconds), undefined, seconds);
      }
      // Тексты 5xx от прокси и сервера могут быть английскими или техническими: показываем понятное сообщение.
      const serverDown = response.status >= 500 ? 'Сервер временно недоступен. Повторите попытку через минуту.' : undefined;
      let body: unknown;
      try { body = await response.clone().json(); } catch { /* Non-JSON proxy errors use the safe fallback below. */ }
      if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' && 'message' in body && typeof body.message === 'string') {
        const details = 'details' in body && Array.isArray(body.details)
          ? body.details.filter((item): item is { field: string; message: string } => typeof item === 'object' && item !== null && typeof item.field === 'string' && typeof item.message === 'string') : undefined;
        throw new ApiError(response.status, body.code, serverDown ?? body.message, details);
      }
      throw new ApiError(response.status, 'HTTP_ERROR', serverDown ?? `Не удалось выполнить запрос (${response.status}). Повторите попытку.`);
    },
    onError() {
      return new ApiError(0, 'NETWORK_ERROR', 'Нет связи с сервером. Проверьте подключение и повторите попытку.');
    },
  });
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { components, paths } from './schema';
