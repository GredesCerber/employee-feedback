import { lastComplaintPath } from '../features/lastComplaint';
import { useLastComplaint } from '../features/lastComplaintStore';
import { useI18n, systemText, localeNames } from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { AnonymousBadge } from '../features/complaintMeta';
import type { Complaint } from '../features/complaint';
import { dateLabel, Loading, LoadError, StatusBadge, statusLabels, typeLabels } from '../features/complaint';
import { PageCompletionSignal } from '../features/CompletionSignal';
import { IdeaQuick } from '../features/IdeaQuick';
import { useRevealOnView } from '../features/designMotion';
import { answerDaysLabel, hasMyFilters, MY_FETCH_LIMIT, MY_FETCH_MAX_PAGES, MY_PAGE_SIZE, MY_SEARCH_MAX, myFiltersFromUrl, myFiltersToQuery, mySortFromUrl, mySortLabels, myStateToUrl, sortMyComplaints } from '../features/myComplaintsFilters';
import type { MyFilters, MySort } from '../features/myComplaintsFilters';
import { ImprovementsTeaser } from '../features/improvements';
import '../styles/feedback-layout.css';
import '../features/myComplaints.css';

const searchDelayMs = 300;

/** #312 A9: пустое состояние для сотрудника без обращений — что это, кто ответит и в какой срок. */
function FirstComplaintIntro() {
  const { t } = useI18n();
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(load);
  const days = answerDaysLabel(reference.data?.categories);
  return <div className="empty-state my-intro" role="region" aria-labelledby="my-intro-title">
    <h2 id="my-intro-title">{t("У вас пока нет обращений.")}</h2>
    <dl className="my-intro-facts">
      <div><dt>{t("Что такое обращение")}</dt><dd>{t("Это проблема, предложение или благодарность, которыми вы делитесь с компанией. Можно подать анонимно.")}</dd></div>
      <div><dt>{t("Кто ответит")}</dt><dd>{t("Обращение автоматически направляется ответственному по выбранной категории. Ответ и уточняющие вопросы появятся в карточке обращения.")}</dd></div>
      <div><dt>{t("В какой срок")}</dt><dd>{days
        ? t("Срок ответа задаёт категория, в календарных днях с момента подачи: {days}. Точная дата видна в карточке и в этом списке.", { days })
        : t("Срок ответа задаёт категория. Точная дата появится в карточке обращения сразу после подачи.")}</dd></div>
    </dl>
    <div className="actions"><Link className="primary-link" to="/submit">{t("Подать обращение")}</Link></div>
  </div>;
}

export default function MyComplaintsPage() {
  const reveal = useRevealOnView<HTMLLIElement>();
  const { t, locale } = useI18n();
  const { api, role } = useSession();
  const lastId = useLastComplaint(role);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlKey = searchParams.toString();
  const applied = useMemo(() => myFiltersFromUrl(new URLSearchParams(urlKey)), [urlKey]);
  const sort = useMemo(() => mySortFromUrl(new URLSearchParams(urlKey)), [urlKey]);
  const active = hasMyFilters(applied);
  const [search, setSearch] = useState(applied.q);
  const [offset, setOffset] = useState(0);
  const [seenAny, setSeenAny] = useState(false);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const heading = useRef<HTMLHeadingElement>(null);

  const sortRef = useRef(sort);
  sortRef.current = sort;
  const update = useCallback((next: MyFilters, nextSort: MySort = sortRef.current) => {
    setOffset(0);
    setSearchParams(myStateToUrl(next, nextSort), { replace: true });
  }, [setSearchParams]);

  // Адрес изменился извне (назад/вперёд): поле поиска показывает то, что применено.
  useEffect(() => { setSearch(current => (current.trim().slice(0, MY_SEARCH_MAX) === applied.q ? current : applied.q)); }, [applied.q]);
  useEffect(() => {
    const q = search.trim().slice(0, MY_SEARCH_MAX);
    if (q === appliedRef.current.q) return;
    const timer = setTimeout(() => update({ ...appliedRef.current, q }), searchDelayMs);
    return () => clearTimeout(timer);
  }, [search, update]);

  // #312 B3: порядок по умолчанию отдаёт сервер постранично; другой порядок — все свои обращения, отсортированные здесь.
  const serverOffset = sort === 'new' ? offset : 0;
  const load = useCallback(async () => {
    if (sort === 'new') return requireData((await api.GET('/complaints', { params: { query: myFiltersToQuery(applied, serverOffset) } })).data);
    const items: Complaint[] = [];
    let total = 0;
    for (let page = 0; page < MY_FETCH_MAX_PAGES; page += 1) {
      const query = { ...myFiltersToQuery(applied, page * MY_FETCH_LIMIT), limit: MY_FETCH_LIMIT };
      const data = requireData((await api.GET('/complaints', { params: { query } })).data);
      items.push(...data.items);
      total = data.total;
      if (data.items.length === 0 || items.length >= total) break;
    }
    return { items: sortMyComplaints(items, sort), total: Math.max(total, items.length), limit: MY_PAGE_SIZE, offset: 0 };
  }, [api, applied, serverOffset, sort]);
  const result = useResource(load);
  const visible = result.data ? (sort === 'new' ? result.data.items : result.data.items.slice(offset, offset + MY_PAGE_SIZE)) : [];
  useEffect(() => { if (result.data && result.data.total > 0) setSeenAny(true); }, [result.data]);

  const number = new Intl.NumberFormat(localeNames[locale]);
  const showTools = active || seenAny || (result.data?.total ?? 0) > 0;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    update({ ...applied, q: search });
  }
  function reset() {
    setSearch('');
    update({ status: '', q: '' });
  }

  return <section className="section my-complaints-page">
    <div className="feedback-heading">
      <div><p className="eyebrow">{t("Личный кабинет")}</p><h1 ref={heading} tabIndex={-1}>{t("Мои обращения")}</h1></div>
    </div>
    {showTools && <nav className="my-quick-actions" aria-label={t("Быстрые действия")}>
      <Link className="primary-link" to="/submit"><strong>{t("Подать обращение")}</strong><span>{t("Проблема, вопрос или благодарность")}</span></Link>
      <Link to="/submit?type=suggestion"><strong>{t("Предложить идею")}</strong><span>{t("Как сделать работу лучше")}</span></Link>
      <Link to="/my?status=awaiting_clarification"><strong>{t("Ждут вашего ответа")}</strong><span>{t("Уточняющие вопросы руководителя")}</span></Link>
      <Link to="/about"><strong>{t("Как всё устроено")}</strong><span>{t("Что реально, что имитация")}</span></Link>
    </nav>}
    {lastId && <p className="feedback-return"><Link to={lastComplaintPath(role, lastId)}>{t("Вернуться к последнему обращению")}</Link></p>}
    <IdeaQuick onCreated={result.reload} />
    {showTools && <form className="my-filters" role="search" aria-label={t("Поиск и фильтр обращений")} onSubmit={submitSearch}>
      <label className="my-filter-search">{t("Поиск по номеру или тексту")}<input type="search" value={search} maxLength={MY_SEARCH_MAX} onChange={event => setSearch(event.target.value)} /></label>
      <label className="my-filter-status">{t("Статус")}<select value={applied.status} onChange={event => update({ status: event.target.value as MyFilters['status'], q: search })}>
        <option value="">{t("Все статусы")}</option>
        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
      </select></label>
      <label className="my-filter-sort">{t("Сортировка")}<select value={sort} onChange={event => update({ ...applied, q: search }, event.target.value as MySort)}>
        {Object.entries(mySortLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
      </select></label>
      {active && <button type="button" className="my-filter-reset" onClick={reset}>{t("Сбросить")}</button>}
    </form>}
    <ImprovementsTeaser />
    {result.loading && <Loading label={t("Загрузка обращений…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {result.data && <>
      {result.data.total === 0 && !active ? <FirstComplaintIntro /> : <>
        <p className="muted my-counter" aria-live="polite">{active
          ? <>{t("Найдено:")} {number.format(result.data.total)}</>
          : <>{t("Всего обращений:")} {number.format(result.data.total)}</>}</p>
        <PageCompletionSignal items={visible} />
        {visible.length === 0 ? <div className="empty-state my-no-results">
          <p>{applied.q ? t("По запросу «{query}» обращений не найдено.", { query: applied.q }) : t("Обращений с выбранным статусом нет.")}</p>
          <p className="muted">{t("Измените поиск или статус либо нажмите «Сбросить», чтобы снова увидеть все свои обращения.")}</p>
          <div className="actions"><button type="button" onClick={() => { reset(); heading.current?.focus(); }}>{t("Сбросить")}</button></div>
        </div> : <ul className="complaint-list">{visible.map(item => <li key={item.id} ref={reveal} className="complaint-item reveal-panel">
          <div className="item-header"><Link className="complaint-number" to={`/my/${item.id}`}>{item.number}</Link>{item.anonymous && <AnonymousBadge />}<StatusBadge status={item.status} /></div>
          <p className="item-description">{item.description}</p>
          <p className="muted">{t(typeLabels[item.type])} · {dateLabel(item.createdAt, locale)}</p>
          <dl className="my-next-action">
            <div><dt>{t("Следующий шаг")}</dt><dd className={item.status === 'awaiting_clarification' ? 'answer-needed' : undefined}>{systemText(locale, item.nextAction)}</dd></div>
            <div><dt>{t("Срок")}</dt><dd className={item.overdue ? 'overdue' : undefined}>{item.overdue && t("Просрочено · срок ")}{dateLabel(item.dueAt, locale)}</dd></div>
          </dl>
        </li>)}</ul>}
        {result.data.total > MY_PAGE_SIZE && <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - MY_PAGE_SIZE))}>{t("Назад")}</button><span>{t("Страница")} {Math.floor(offset / MY_PAGE_SIZE) + 1} {t("из")} {Math.max(1, Math.ceil(result.data.total / MY_PAGE_SIZE))}</span><button disabled={offset + visible.length >= result.data.total} onClick={() => setOffset(value => value + MY_PAGE_SIZE)}>{t("Далее")}</button></div>}
      </>}
    </>}
  </section>;
}
