import { lastComplaintPath } from '../features/lastComplaint';
import { useLastComplaint } from '../features/lastComplaintStore';
import { referenceLabel, localeNames, useI18n, localizeError } from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import type { paths } from '../api/client';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, StatusBadge, statusLabels } from '../features/complaint';
import type { Complaint } from '../features/complaint';
import { ImitationBadge } from '../features/demo';
import { PageCompletionSignal } from '../features/CompletionSignal';
import '../styles/feedback-layout.css';

type Query = NonNullable<paths['/complaints']['get']['parameters']['query']>;
type Filters = { assignee: 'me' | ''; departmentId: string; categoryId: string; status: Complaint['status'] | ''; dueAfter: string; dueBefore: string; overdue: boolean; queue: 'assigned' | 'unassigned' | ''; q: string; hideSimulated: boolean };
const emptyFilters: Filters = { assignee: '', departmentId: '', categoryId: '', status: '', dueAfter: '', dueBefore: '', overdue: false, queue: '', q: '', hideSimulated: false };
const quickFilters: { label: string; filters: Pick<Filters, 'status' | 'overdue' | 'queue'> }[] = [
  { label: 'Все', filters: { status: '', overdue: false, queue: '' } },
  { label: 'Новые', filters: { status: 'new', overdue: false, queue: '' } },
  { label: 'Просроченные', filters: { status: '', overdue: true, queue: '' } },
  { label: 'Без ответственного', filters: { status: '', overdue: false, queue: 'unassigned' } },
];
type Reference = { departments: { id: string }[]; categories: { id: string }[] };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: string) => datePattern.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

/** Фильтры из адресной строки. Неизвестные ключи и значения молча отбрасываются. */
function filtersFromUrl(params: URLSearchParams, reference?: Reference): Filters {
  const text = (key: string) => params.get(key)?.trim() ?? '';
  const known = (value: string, items?: { id: string }[]) => (items?.some(item => item.id === value) ? value : '');
  const status = text('status'), queue = text('queue'), dueAfter = text('dueAfter'), dueBefore = text('dueBefore');
  const filters: Filters = {
    assignee: text('assignee') === 'me' ? 'me' : '',
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
  if (filters.assignee) params.set('assignee', filters.assignee);
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
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
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
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(localeNames[locale]);
  const { api, role } = useSession();
  const lastId = useLastComplaint(role);
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
  const [filtersOpen, setFiltersOpen] = useState(() => window.matchMedia?.('(min-width: 721px)').matches ?? false);
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

  function applyQuick(preset: Pick<Filters, 'status' | 'overdue' | 'queue'>) {
    setFilterError('');
    const next = filtersToUrl({ ...applied, ...preset, q: search.trim().slice(0, 200) });
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

  return <section className="section queue-page">
    <div className="feedback-heading">
      <div><p className="eyebrow">{t("Рабочая область руководителя")}</p><h1 ref={heading} tabIndex={-1}>{t("Очередь обращений")}</h1></div>
      {role !== 'employee' && <button type="button" className="export-button" onClick={download} disabled={exporting} aria-busy={exporting}>{exporting ? t("Готовим файл…") : t("Скачать CSV")}</button>}
    </div>
    {lastId && <p className="feedback-return"><Link to={lastComplaintPath(role, lastId)}>{t("Вернуться к последнему обращению")}</Link></p>}
    {reference.loading && <Loading label={t("Загрузка фильтров…")} />}
    {reference.error && <LoadError message={reference.error} retry={reference.reload} retryAfter={reference.retryAfter} />}
    {role === 'manager' && <div className="queue-quick" role="group" aria-label={t("Назначение")}>
      <span className="muted">{t("Назначение")}</span>
      {(['', 'me'] as const).map(value => <button key={value} type="button" aria-pressed={applied.assignee === value} onClick={() => {
        const next = filtersToUrl({ ...applied, assignee: value, q: search.trim().slice(0, 200) });
        setPendingKey(next.toString()); setSearchParams(next);
      }}>{value ? t("Мои") : t("Все")}</button>)}
    </div>}
    <div className="queue-quick" role="group" aria-label={t("Быстрые фильтры")}>
      {quickFilters.map(({ label, filters: preset }) => <button key={label} type="button" aria-pressed={applied.status === preset.status && applied.overdue === preset.overdue && applied.queue === preset.queue} onClick={() => applyQuick(preset)}>{t(label)}</button>)}
    </div>
    <div className="queue-toolbar">
      <div className="queue-search" role="search"><label className="search-field"><span className="visually-hidden">{t("Поиск по номеру или тексту")}</span><input type="search" placeholder={t("Поиск по номеру или тексту")} value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /></label></div>
      {reference.data && <button type="button" className="filter-toggle" aria-expanded={filtersOpen} aria-controls="queue-filters" onClick={() => setFiltersOpen(open => !open)}>{t("Фильтры")}</button>}
    </div>
    {exportError && <p role="alert" className="field-error">{localizeError(locale, exportError)}</p>}
    {reference.data && <form id="queue-filters" className={filtersOpen ? 'filter-form is-open' : 'filter-form'} onSubmit={apply}>
      <label>{t("Подразделение")}<select value={filters.departmentId} onChange={event => setFilters({ ...filters, departmentId: event.target.value })}><option value="">{t("Все подразделения")}</option>{reference.data.departments.map(item => <option key={item.id} value={item.id}>{referenceLabel(locale, 'department', item.id, item.name)}</option>)}</select></label>
      <label>{t("Категория")}<select value={filters.categoryId} onChange={event => setFilters({ ...filters, categoryId: event.target.value })}><option value="">{t("Все категории")}</option>{reference.data.categories.map(item => <option key={item.id} value={item.id}>{referenceLabel(locale, 'category', item.id, item.name)}</option>)}</select></label>
      <label>{t("Статус")}<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as Filters['status'] })}><option value="">{t("Все статусы")}</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      <label>{t("Очередь")}<select value={filters.queue} onChange={event => setFilters({ ...filters, queue: event.target.value as Filters['queue'] })}><option value="">{t("Все обращения")}</option><option value="unassigned">{t("Без ответственного")}</option><option value="assigned">{t("С ответственным")}</option></select></label>
      <label>{t("Срок от")}<input id="due-after" type="date" aria-invalid={Boolean(filterError)} aria-describedby={filterError ? 'filter-error' : undefined} value={filters.dueAfter} onChange={event => setFilters({ ...filters, dueAfter: event.target.value })} /></label>
      <label>{t("Срок до")}<input type="date" aria-invalid={Boolean(filterError)} aria-describedby={filterError ? 'filter-error' : undefined} value={filters.dueBefore} onChange={event => setFilters({ ...filters, dueBefore: event.target.value })} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={filters.overdue} onChange={event => setFilters({ ...filters, overdue: event.target.checked })} />{t("Только просроченные")}</label>
      <label className="checkbox-label"><input type="checkbox" checked={filters.hideSimulated} onChange={event => setFilters({ ...filters, hideSimulated: event.target.checked })} />{t("Скрыть имитацию")}</label>
      {filterError && <p id="filter-error" role="alert" className="field-error">{t(filterError)}</p>}
      <div className="actions"><button className="primary-button" type="submit">{t("Применить фильтры")}</button><button type="button" onClick={reset}>{t("Сбросить")}</button></div>
    </form>}
    {(result.loading || stale) && <Loading label={t("Загрузка очереди…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {shown && !stale && <><p className="muted queue-counter" aria-live="polite"><span>{t("Найдено:")} {number.format(shown.total)}</span>{overall.data !== undefined && <> <span>{t("из")} {number.format(overall.data)}</span></>}</p>
      <PageCompletionSignal items={shown.items} />
      {shown.items.length === 0 ? <div className="empty-state"><p>{applied.q ? t('По запросу «{query}» обращений нет.', { query: applied.q }) : t("По выбранным фильтрам обращений нет.")}</p><p className="muted">{t("Измените условия или нажмите «Сбросить фильтры», чтобы увидеть всю очередь.")}</p><div className="actions"><button type="button" onClick={() => { reset(); heading.current?.focus(); }}>{t("Сбросить фильтры")}</button>{applied.q && <button type="button" onClick={clearSearch}>{t("Сбросить поиск")}</button>}</div></div> : <>
        <div className="queue-list-header" aria-hidden="true"><span>{t("Обращение")}</span><span>{t("Статус")}</span><span>{t("Ответственный")}</span><span>{t("Срок")}</span></div>
        <ul className="complaint-list queue-list">{shown.items.map(item => <li className={item.id === lastId ? "complaint-item is-last-opened" : "complaint-item"} key={item.id}>
          <div className="queue-record">
            <Link className="complaint-number" to={`/queue/${item.id}`} state={{ queueSearch: urlKey }}>{item.number}</Link>
            {item.simulated && <ImitationBadge hint={t("создано демо-симулятором")} />}
            <p className="item-description">{item.description}</p>
          </div>
          <div className="queue-status"><StatusBadge status={item.status} /></div>
          <p className="queue-owner muted"><span className="visually-hidden">{t("Ответственный:")} </span>{item.assignee?.name ?? t("Без ответственного")}</p>
          <p className={`queue-due ${item.overdue ? 'overdue' : 'muted'}`}>{item.overdue ? t("Просрочено · срок ") : <span className="visually-hidden">{t("Срок:")} </span>}{dateLabel(item.dueAt, locale)}</p>
        </li>)}</ul>
      </>}
      {shown.total > 20 && <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>{t("Назад")}</button><span>{t("Страница")} {Math.floor(offset / 20) + 1} {t("из")} {Math.max(1, Math.ceil(shown.total / 20))}</span><button disabled={offset + shown.items.length >= shown.total} onClick={() => setOffset(offset + 20)}>{t("Далее")}</button></div>}
    </>}
  </section>;
}
