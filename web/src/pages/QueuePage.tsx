import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import type { paths } from '../api/client';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, StatusBadge, statusLabels } from '../features/complaint';
import type { Complaint } from '../features/complaint';
import { ImitationBadge } from '../features/demo';

type Query = NonNullable<paths['/complaints']['get']['parameters']['query']>;
type Filters = { departmentId: string; categoryId: string; status: Complaint['status'] | ''; dueAfter: string; dueBefore: string; overdue: boolean; queue: 'assigned' | 'unassigned' | ''; q: string; hideSimulated: boolean };
const emptyFilters: Filters = { departmentId: '', categoryId: '', status: '', dueAfter: '', dueBefore: '', overdue: false, queue: '', q: '', hideSimulated: false };
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
    hideSimulated: params.get('hideSimulated') === '1',
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
  if (filters.hideSimulated) params.set('hideSimulated', '1');
  if (filters.dueAfter) params.set('dueAfter', filters.dueAfter);
  if (filters.dueBefore) params.set('dueBefore', filters.dueBefore);
  return params;
}

function filtersToQuery(filters: Filters, offset: number): Query {
  return { limit: 20, offset, ...filterParams(filters) } as Query;
}

function filterParams(filters: Filters) {
  return {
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.queue ? { queue: filters.queue } : {}),
    ...(filters.overdue ? { overdue: true } : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    // simulated есть в контракте, но не в списке parameters: в сгенерированном типе его нет.
    ...(filters.hideSimulated ? { simulated: false } : {}),
    ...(filters.dueAfter ? { dueAfter: new Date(`${filters.dueAfter}T00:00:00`).toISOString() } : {}),
    ...(filters.dueBefore ? { dueBefore: new Date(`${filters.dueBefore}T23:59:59.999`).toISOString() } : {}),
  };
}

const searchDelayMs = 300;
export const QUEUE_POLL_INTERVAL_MS = 10_000;
const pad = (value: number) => String(value).padStart(2, '0');
/** Имя файла выгрузки: obrasheniya-ГГГГ-ММ-ДД.csv (локальная дата). */
function exportFileName(now = new Date()) {
  return `obrasheniya-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

export default function QueuePage() {
  const { api, role } = useSession();
  const heading = useRef<HTMLHeadingElement>(null);
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
  // Поиск: поле живёт отдельно от формы фильтров и попадает в адрес через 300 мс после последнего символа.
  const [search, setSearch] = useState(applied.q);
  useEffect(() => { setSearch(current => (current.trim() === applied.q ? current : applied.q)); }, [applied.q]);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  useEffect(() => {
    if (search.trim().slice(0, 200) === applied.q) return;
    const timer = setTimeout(() => {
      const next = filtersToUrl({ ...appliedRef.current, q: search.trim().slice(0, 200) });
      setPendingKey(next.toString());
      setSearchParams(next);
    }, searchDelayMs);
    return () => clearTimeout(timer);
  }, [search, applied.q, setSearchParams]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const query = useMemo(() => filtersToQuery(applied, offset), [applied, offset]);
  const [filterError, setFilterError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const ready = !needsReference || reference.data !== undefined || reference.error !== undefined;
  const load = useCallback(async () => {
    if (!ready) return new Promise<never>(() => {});
    return { query, page: requireData((await api.GET('/complaints', { params: { query } })).data) };
  }, [api, query, ready]);
  const result = useResource(load);
  // Список показываем только для текущего запроса: после «Применить» старые строки не должны выдавать себя за новый результат.
  const page = result.data && result.data.query === query ? result.data.page : undefined;
  // Смена адреса идёт в переходе React Router: до его завершения на экране ещё старый список. pendingKey прячет его сразу.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Опрос: тихо перечитываем текущую страницу раз в 10 с, без индикатора загрузки; ввод и фокус не затрагиваются.
  const [polled, setPolled] = useState<{ query: Query; page: NonNullable<typeof page> } | undefined>();
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setInterval(() => {
      api.GET('/complaints', { params: { query } }).then(({ data }) => { if (active && data) setPolled({ query, page: data }); }).catch(() => { /* сеть недоступна: оставляем прежний список */ });
    }, QUEUE_POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [api, query, ready]);
  const shown = polled && polled.query === query ? polled.page : page;
  const stale = (result.data !== undefined && page === undefined) || (pendingKey !== null && pendingKey !== urlKey);
  // M в «Найдено: N из M» — всего обращений в очереди без фильтров (один лёгкий запрос).
  const loadTotal = useCallback(async () => requireData((await api.GET('/complaints', { params: { query: { limit: 1, offset: 0 } } })).data).total, [api]);
  const overall = useResource(loadTotal);

  function apply(event: FormEvent) {
    event.preventDefault();
    if (filters.dueAfter && filters.dueBefore && filters.dueAfter > filters.dueBefore) {
      setFilterError('Начало периода должно быть не позже окончания.');
      document.getElementById('due-after')?.focus(); return;
    }
    setFilterError('');
    const next = filtersToUrl({ ...filters, q: search.trim().slice(0, 200) });
    setPendingKey(next.toString());
    setSearchParams(next);
  }

  async function download() {
    setExporting(true); setExportError('');
    try {
      const { data } = await api.GET('/complaints/export', { params: { query: filterParams(applied) }, parseAs: 'blob' });
      if (!data || data.size === 0) throw new Error('empty');
      const link = document.createElement('a');
      const href = URL.createObjectURL(data);
      link.href = href; link.download = exportFileName();
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      setExportError(error instanceof Error && error.message !== 'empty' ? error.message : 'Не удалось скачать файл. Повторите попытку.');
    } finally { setExporting(false); }
  }

  function clearSearch() {
    setSearch('');
    const next = filtersToUrl({ ...applied, q: '' });
    setPendingKey(next.toString());
    setSearchParams(next);
  }

  function reset() {
    setFilterError('');
    setSearch('');
    setFilters(emptyFilters);
    setPendingKey('');
    setSearchParams(new URLSearchParams());
  }

  return <section className="section"><p className="eyebrow">Рабочая область руководителя</p><h1 ref={heading} tabIndex={-1}>Очередь обращений</h1>
    {reference.loading && <Loading label="Загрузка фильтров…" />}
    {reference.error && <LoadError message={reference.error} retry={reference.reload} retryAfter={reference.retryAfter} />}
    <div className="queue-toolbar" role="search">
      <label className="search-field">Поиск по номеру или тексту<input type="search" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /></label>
      {role !== 'employee' && <button type="button" className="export-button" onClick={download} disabled={exporting}>{exporting ? 'Готовим файл…' : 'Скачать CSV'}</button>}
    </div>
    {exportError && <p role="alert" className="field-error">{exportError}</p>}
    {reference.data && <button type="button" className="filter-toggle" aria-expanded={filtersOpen} aria-controls="queue-filters" onClick={() => setFiltersOpen(open => !open)}>Фильтры</button>}
    {reference.data && <form id="queue-filters" className={filtersOpen ? 'filter-form is-open' : 'filter-form'} onSubmit={apply}>
      <label>Подразделение<select value={filters.departmentId} onChange={event => setFilters({ ...filters, departmentId: event.target.value })}><option value="">Все подразделения</option>{reference.data.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Категория<select value={filters.categoryId} onChange={event => setFilters({ ...filters, categoryId: event.target.value })}><option value="">Все категории</option>{reference.data.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Статус<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as Filters['status'] })}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Очередь<select value={filters.queue} onChange={event => setFilters({ ...filters, queue: event.target.value as Filters['queue'] })}><option value="">Все обращения</option><option value="unassigned">Без ответственного</option><option value="assigned">С ответственным</option></select></label>
      <label>Срок от<input id="due-after" type="date" aria-invalid={Boolean(filterError)} aria-describedby={filterError ? 'filter-error' : undefined} value={filters.dueAfter} onChange={event => setFilters({ ...filters, dueAfter: event.target.value })} /></label>
      <label>Срок до<input type="date" aria-invalid={Boolean(filterError)} aria-describedby={filterError ? 'filter-error' : undefined} value={filters.dueBefore} onChange={event => setFilters({ ...filters, dueBefore: event.target.value })} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={filters.overdue} onChange={event => setFilters({ ...filters, overdue: event.target.checked })} />Только просроченные</label>
      <label className="checkbox-label"><input type="checkbox" checked={filters.hideSimulated} onChange={event => setFilters({ ...filters, hideSimulated: event.target.checked })} />Скрыть имитацию</label>
      {filterError && <p id="filter-error" role="alert" className="field-error">{filterError}</p>}
      <div className="actions"><button className="primary-button" type="submit">Применить фильтры</button><button type="button" onClick={reset}>Сбросить</button></div>
    </form>}
    {(result.loading || stale) && <Loading label="Загрузка очереди…" />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {shown && !stale && <><p className="muted queue-counter" aria-live="polite"><span>Найдено: {shown.total}</span>{overall.data !== undefined && <> <span>из {overall.data}</span></>}</p>
      {shown.items.length === 0 ? <div className="empty-state"><p>{applied.q ? `По запросу «${applied.q}» обращений нет.` : 'По выбранным фильтрам обращений нет.'}</p><p className="muted">Измените условия или нажмите «Сбросить фильтры», чтобы увидеть всю очередь.</p><div className="actions"><button type="button" onClick={() => { reset(); heading.current?.focus(); }}>Сбросить фильтры</button>{applied.q && <button type="button" onClick={clearSearch}>Сбросить поиск</button>}</div></div> : <ul className="complaint-list">{shown.items.map(item => <li className="complaint-item" key={item.id}>
        <div className="item-header"><Link className="complaint-number" to={`/queue/${item.id}`}>{item.number}</Link>{item.simulated && <ImitationBadge hint="создано демо-симулятором" />}<StatusBadge status={item.status} /></div>
        <p className="item-description">{item.description}</p><p className="muted">{item.assignee?.name ?? 'Без ответственного'}</p>
        <p className={item.overdue ? 'overdue' : 'muted'}>{item.overdue ? 'Просрочено · срок ' : 'Срок: '}{dateLabel(item.dueAt)}</p>
      </li>)}</ul>}
      {shown.total > 20 && <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Назад</button><span>Страница {Math.floor(offset / 20) + 1} из {Math.max(1, Math.ceil(shown.total / 20))}</span><button disabled={offset + shown.items.length >= shown.total} onClick={() => setOffset(offset + 20)}>Далее</button></div>}
    </>}
  </section>;
}
