import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import type { paths } from '../api/client';
import { requireData, useResource } from '../features/data';
import { dateLabel, LoadError, StatusBadge, statusLabels } from '../features/complaint';
import type { Complaint } from '../features/complaint';

type Query = NonNullable<paths['/complaints']['get']['parameters']['query']>;
type Filters = { departmentId: string; categoryId: string; status: Complaint['status'] | ''; dueAfter: string; dueBefore: string; overdue: boolean; queue: 'assigned' | 'unassigned' | ''; q: string };
const emptyFilters: Filters = { departmentId: '', categoryId: '', status: '', dueAfter: '', dueBefore: '', overdue: false, queue: '', q: '' };
type Reference = { departments: { id: string }[]; categories: { id: string }[] };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: string) => datePattern.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

/** Фильтры из адресной строки. Неизвестные ключи и значения молча отбрасываются. */
function filtersFromUrl(params: URLSearchParams, reference?: Reference): Filters {
  const text = (key: string) => params.get(key)?.trim() ?? '';
  const known = (value: string, items?: { id: string }[]) => (items?.some(item => item.id === value) ? value : '');
  const status = text('status'), queue = text('queue'), dueAfter = text('dueAfter'), dueBefore = text('dueBefore');
  const filters: Filters = {
    departmentId: known(text('departmentId'), reference?.departments),
    categoryId: known(text('categoryId'), reference?.categories),
    status: status in statusLabels ? status as Filters['status'] : '',
    queue: queue === 'assigned' || queue === 'unassigned' ? queue : '',
    overdue: params.get('overdue') === '1' || params.get('overdue') === 'true',
    q: text('q').slice(0, 200),
    dueAfter: isDate(dueAfter) ? dueAfter : '',
    dueBefore: isDate(dueBefore) ? dueBefore : '',
  };
  if (filters.dueAfter && filters.dueBefore && filters.dueAfter > filters.dueBefore) { filters.dueAfter = ''; filters.dueBefore = ''; }
  return filters;
}

function filtersToUrl(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.status) params.set('status', filters.status);
  if (filters.queue) params.set('queue', filters.queue);
  if (filters.overdue) params.set('overdue', '1');
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.dueAfter) params.set('dueAfter', filters.dueAfter);
  if (filters.dueBefore) params.set('dueBefore', filters.dueBefore);
  return params;
}

function filtersToQuery(filters: Filters, offset: number): Query {
  return { limit: 20, offset,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.queue ? { queue: filters.queue } : {}),
    ...(filters.overdue ? { overdue: true } : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.dueAfter ? { dueAfter: new Date(`${filters.dueAfter}T00:00:00`).toISOString() } : {}),
    ...(filters.dueBefore ? { dueBefore: new Date(`${filters.dueBefore}T23:59:59.999`).toISOString() } : {}),
  };
}

export default function QueuePage() {
  const { api } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadReference = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(loadReference);
  // Подразделение и категорию из ссылки можно проверить только по справочнику, поэтому ждём его, если они заданы.
  const needsReference = searchParams.has('departmentId') || searchParams.has('categoryId');
  const urlKey = searchParams.toString();
  const applied = useMemo(() => filtersFromUrl(new URLSearchParams(urlKey), reference.data), [urlKey, reference.data]);
  const [filters, setFilters] = useState(applied);
  useEffect(() => { setFilters(applied); }, [applied]);
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); }, [urlKey]);
  const query = useMemo(() => filtersToQuery(applied, offset), [applied, offset]);
  const [filterError, setFilterError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const ready = !needsReference || reference.data !== undefined || reference.error !== undefined;
  const load = useCallback(async () => {
    if (!ready) return new Promise<never>(() => {});
    return requireData((await api.GET('/complaints', { params: { query } })).data);
  }, [api, query, ready]);
  const result = useResource(load);
  // M в «Найдено: N из M» — всего обращений в очереди без фильтров (один лёгкий запрос).
  const loadTotal = useCallback(async () => requireData((await api.GET('/complaints', { params: { query: { limit: 1, offset: 0 } } })).data).total, [api]);
  const overall = useResource(loadTotal);

  function apply(event: FormEvent) {
    event.preventDefault();
    if (filters.dueAfter && filters.dueBefore && filters.dueAfter > filters.dueBefore) {
      setFilterError('Начало периода должно быть не позже окончания.'); return;
    }
    setFilterError('');
    setSearchParams(filtersToUrl(filters));
  }

  function reset() {
    setFilterError('');
    setFilters(emptyFilters);
    setSearchParams(new URLSearchParams());
  }

  return <section className="section"><p className="eyebrow">Рабочая область руководителя</p><h1>Очередь обращений</h1>
    {reference.loading && <p role="status">Загрузка фильтров…</p>}
    {reference.error && <LoadError message={reference.error} retry={reference.reload} />}
    {reference.data && <button type="button" className="filter-toggle" aria-expanded={filtersOpen} aria-controls="queue-filters" onClick={() => setFiltersOpen(open => !open)}>Фильтры</button>}
    {reference.data && <form id="queue-filters" className={filtersOpen ? 'filter-form is-open' : 'filter-form'} onSubmit={apply}>
      <label>Подразделение<select value={filters.departmentId} onChange={event => setFilters({ ...filters, departmentId: event.target.value })}><option value="">Все подразделения</option>{reference.data.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Категория<select value={filters.categoryId} onChange={event => setFilters({ ...filters, categoryId: event.target.value })}><option value="">Все категории</option>{reference.data.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Статус<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as Filters['status'] })}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Очередь<select value={filters.queue} onChange={event => setFilters({ ...filters, queue: event.target.value as Filters['queue'] })}><option value="">Все обращения</option><option value="unassigned">Без ответственного</option><option value="assigned">С ответственным</option></select></label>
      <label>Срок от<input type="date" value={filters.dueAfter} onChange={event => setFilters({ ...filters, dueAfter: event.target.value })} /></label>
      <label>Срок до<input type="date" value={filters.dueBefore} onChange={event => setFilters({ ...filters, dueBefore: event.target.value })} /></label>
      <label className="search-field">Поиск по номеру или тексту<input value={filters.q} maxLength={200} onChange={event => setFilters({ ...filters, q: event.target.value })} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={filters.overdue} onChange={event => setFilters({ ...filters, overdue: event.target.checked })} />Только просроченные</label>
      {filterError && <p role="alert" className="field-error">{filterError}</p>}
      <div className="actions"><button className="primary-button" type="submit">Применить фильтры</button><button type="button" onClick={reset}>Сбросить</button></div>
    </form>}
    {result.loading && <p role="status">Загрузка очереди…</p>}
    {result.error && <LoadError message={result.error} retry={result.reload} />}
    {result.data && <><p className="muted queue-counter" aria-live="polite"><span>Найдено: {result.data.total}</span>{overall.data !== undefined && <> <span>из {overall.data}</span></>}</p>
      {result.data.items.length === 0 ? <p>По выбранным фильтрам обращений нет.</p> : <ul className="complaint-list">{result.data.items.map(item => <li className="complaint-item" key={item.id}>
        <div className="item-header"><Link className="complaint-number" to={`/queue/${item.id}`}>{item.number}</Link><StatusBadge status={item.status} /></div>
        <p className="item-description">{item.description}</p><p className="muted">{item.assignee?.name ?? 'Без ответственного'}</p>
        <p className={item.overdue ? 'overdue' : 'muted'}>{item.overdue ? 'Просрочено · срок ' : 'Срок: '}{dateLabel(item.dueAt)}</p>
      </li>)}</ul>}
      <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Назад</button><span>Страница {Math.floor(offset / 20) + 1} из {Math.max(1, Math.ceil(result.data.total / 20))}</span><button disabled={offset + result.data.items.length >= result.data.total} onClick={() => setOffset(offset + 20)}>Далее</button></div>
    </>}
  </section>;
}
