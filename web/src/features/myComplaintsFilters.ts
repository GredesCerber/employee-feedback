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

/**
 * #312 B3: сортировка «Моих обращений». В контракте GET /complaints нет параметра сортировки
 * (порядок сервера — createdAt по убыванию), поэтому «Сначала старые» и «Ближайший срок»
 * загружают все свои обращения страницами по MY_FETCH_LIMIT и сортируют на клиенте,
 * а листают по MY_PAGE_SIZE — порядок верен на всех страницах, а не только внутри одной.
 */
export type MySort = 'new' | 'old' | 'due';
export const mySortLabels: Record<MySort, string> = { new: 'Сначала новые', old: 'Сначала старые', due: 'Ближайший срок' };
export const MY_PAGE_SIZE = 20;
export const MY_FETCH_LIMIT = 100;
/** Предохранитель от бесконечной подгрузки: не больше стольких запросов на одну сортировку. */
export const MY_FETCH_MAX_PAGES = 20;

export function mySortFromUrl(params: URLSearchParams): MySort {
  const value = params.get('sort')?.trim();
  return value === 'old' || value === 'due' ? value : 'new';
}

/** Адрес: фильтры как раньше плюс sort, если он не по умолчанию. */
export function myStateToUrl(filters: MyFilters, sort: MySort): URLSearchParams {
  const params = myFiltersToUrl(filters);
  if (sort !== 'new') params.set('sort', sort);
  return params;
}

const terminalStatuses = new Set<Complaint['status']>(['implemented', 'rejected', 'closed']);
const time = (value: string) => { const parsed = Date.parse(value); return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed; };
const byId = (a: Complaint, b: Complaint) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * «new» — порядок контракта (createdAt по убыванию, затем id). «old» — createdAt по возрастанию.
 * «due» — сначала незавершённые по сроку (просроченные и ближайшие сверху), завершённые в конце:
 * их срок уже не важен для сотрудника.
 */
export function sortMyComplaints<T extends Complaint>(items: readonly T[], sort: MySort): T[] {
  const list = [...items];
  if (sort === 'new') return list.sort((a, b) => time(b.createdAt) - time(a.createdAt) || byId(a, b));
  if (sort === 'old') return list.sort((a, b) => time(a.createdAt) - time(b.createdAt) || byId(a, b));
  return list.sort((a, b) => Number(terminalStatuses.has(a.status)) - Number(terminalStatuses.has(b.status))
    || time(a.dueAt) - time(b.dueAt) || time(b.createdAt) - time(a.createdAt) || byId(a, b));
}
