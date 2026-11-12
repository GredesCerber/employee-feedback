import { statusLabels } from './complaint';
import type { Complaint } from './complaint';

/** Фильтры «Моих обращений» (#312 A7). Ключи в адресе те же, что у очереди: status и q. */
export type MyFilters = { status: Complaint['status'] | ''; q: string };
export const emptyMyFilters: MyFilters = { status: '', q: '' };
export const MY_SEARCH_MAX = 200;

/** Как filtersFromUrl в QueuePage: неизвестный статус и пустой поиск молча отбрасываются. */
export function myFiltersFromUrl(params: URLSearchParams): MyFilters {
  const status = params.get('status')?.trim() ?? '';
  return {
    status: status in statusLabels ? status as MyFilters['status'] : '',
    q: (params.get('q')?.trim() ?? '').slice(0, MY_SEARCH_MAX),
  };
}

export function myFiltersToUrl(filters: MyFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  const q = filters.q.trim().slice(0, MY_SEARCH_MAX);
  if (q) params.set('q', q);
  return params;
}

/** Параметры GET /complaints: status и q есть в контракте и для сотрудника применяются к его собственным обращениям. */
export function myFiltersToQuery(filters: MyFilters, offset: number) {
  const q = filters.q.trim().slice(0, MY_SEARCH_MAX);
  return { limit: 20, offset, ...(filters.status ? { status: filters.status } : {}), ...(q ? { q } : {}) };
}

export const hasMyFilters = (filters: MyFilters) => Boolean(filters.status || filters.q.trim());

/** Срок ответа из правил категорий (dueInDays, календарные дни): «7» или «3–10». Без категорий — null. */
export function answerDaysLabel(categories: { dueInDays: number }[] | undefined): string | null {
  const days = (categories ?? []).map(item => item.dueInDays).filter(value => Number.isFinite(value) && value > 0);
  if (days.length === 0) return null;
  const min = Math.min(...days), max = Math.max(...days);
  return min === max ? String(min) : `${min}–${max}`;
}
