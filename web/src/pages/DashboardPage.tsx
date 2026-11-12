import { useI18n, localeNames, referenceLabel } from '../i18n';
import { useCallback, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import type { components } from '../api/client';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError } from '../features/complaint';
import { BarChart, useContainerWidth } from './SummaryPage';
import { CompletionSignal } from '../features/CompletionSignal';
import { useRevealOnView } from '../features/designMotion';
import { WeeklyDigest } from '../features/weeklyDigest';
import './dashboard.css';

type DayCount = components['schemas']['DayCount'];

/** «2026-11-10» → «10.11» без перевода часового пояса: даты в ответе уже в UTC. */
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

const LINE = { height: 188, left: 44, right: 20, top: 14, bottom: 45 };

/** Линейный график «обращения по дням» на чистом SVG: оси с подписями, точки, таблица-альтернатива рядом. */
function LineChart({ title, days }: { title: string; days: DayCount[] }) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 });
  const titleId = useId();
  const { ref, width } = useContainerWidth();
  const reveal = useRevealOnView<HTMLDivElement>();
  const max = Math.max(1, ...days.map(day => day.count));
  const plotWidth = Math.max(1, width - LINE.left - LINE.right), plotHeight = LINE.height - LINE.top - LINE.bottom;
  const x = (index: number) => LINE.left + (days.length > 1 ? (index / (days.length - 1)) * plotWidth : plotWidth / 2);
  const y = (value: number) => LINE.top + plotHeight - (value / max) * plotHeight;
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const baseline = LINE.top + plotHeight;
  const end = LINE.left + plotWidth;
  const points = days.map((day, index) => `${x(index)},${y(day.count)}`).join(' ');
  const labelCount = Math.max(2, Math.floor(plotWidth / 80));
  const labelEvery = Math.max(1, Math.ceil((days.length - 1) / labelCount));
  return <div ref={reveal} className="chart-motion"><div ref={ref}>
    <svg className="line-chart" role="img" aria-labelledby={titleId} viewBox={`0 0 ${width} ${LINE.height}`} preserveAspectRatio="xMinYMin meet">
    <title id={titleId}>{`${title}: ${days.map(day => `${shortDate(day.date)} — ${number.format(day.count)}`).join(', ')}`}</title>
    {ticks.map(tick => <g key={tick}>
      <line className="chart-grid" x1={LINE.left} x2={end} y1={y(tick)} y2={y(tick)} />
      <text className="chart-tick" x={LINE.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{number.format(tick)}</text>
    </g>)}
    <line className="chart-axis" x1={LINE.left} x2={end} y1={baseline} y2={baseline} />
    {days.map((day, index) => index !== days.length - 1 && (index % labelEvery !== 0 || days.length - 1 - index < labelEvery) ? null
      : <text key={day.date} className="chart-tick" x={x(index)} y={baseline + 18} textAnchor="middle">{shortDate(day.date)}</text>)}
    <g className="line-series">
      {days.length > 1 && <polygon className="line-area" points={`${x(0)},${baseline} ${points} ${x(days.length - 1)},${baseline}`} />}
      <polyline className="line-path" points={points} />
      {days.map((day, index) => <circle key={day.date} data-point={day.date} className="line-point" cx={x(index)} cy={y(day.count)} r={days.length === 1 ? 3 : 2} />)}
    </g>
    <text className="chart-axis-title" x={LINE.left + plotWidth / 2} y={LINE.height - 6} textAnchor="middle">{t("Дата")}</text>
    <text className="chart-axis-title" x={14} y={LINE.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${LINE.top + plotHeight / 2})`}>{t("Обращений")}</text>
    </svg>
  </div></div>;
}

function CountTable({ label, head, rows }: { label: string; head: string; rows: { key: string; name: string; count: number }[] }) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 });
  return <table className="dashboard-table" aria-label={label}><thead><tr><th scope="col">{head}</th><th scope="col">{t("Количество")}</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.name}</th><td>{number.format(row.count)}</td></tr>)}</tbody></table>;
}

function Tile({ id, title, value, note }: { id: string; title: string; value: string; note: string }) {
  return <section className="metric-card" aria-labelledby={id}><h2 id={id}>{title}</h2><p className="metric-value">{value}</p><p className="muted">{note}</p></section>;
}

export default function DashboardPage() {
  const revealPanel = useRevealOnView<HTMLElement>();
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const categoriesId = useId();
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 });
  const { api, role } = useSession();
  const [params, setParams] = useSearchParams();
  const department = params.get('department')?.trim() ?? '';
  const categorySort = params.get('categorySort') === 'name' ? 'name' : 'count';
  const loadReference = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(loadReference);
  const loadTrends = useCallback(async () => requireData((await api.GET('/analytics/trends', {
    params: { query: department ? { department } : {} },
  })).data), [api, department]);
  const result = useResource(loadTrends);
  const trends = result.data;
  const totals = trends?.totals;
  const empty = totals?.total === 0;
  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }
  const collator = new Intl.Collator(localeNames[locale]);
  const categoryRows = (trends?.byCategory ?? []).map(item => ({
    key: item.categoryId, name: referenceLabel(locale, 'category', item.categoryId, item.categoryName), count: item.count,
  })).sort((a, b) => (categorySort === 'count' ? b.count - a.count : 0)
    || collator.compare(a.name, b.name) || a.key.localeCompare(b.key));
  const visibleCategories = showAllCategories ? categoryRows : categoryRows.slice(0, 8);
  return <section className="section dashboard-page">
    <header className="dashboard-header">
      <div><p className="eyebrow">{t("Обзор обратной связи")}</p><h1>{t("Дашборд")}</h1>
        <p className="muted">{t("Как меняется нагрузка и какие обращения требуют внимания.")}</p></div>
      {reference.data && <label className="dashboard-department">{t("Подразделение")}<select value={department} onChange={event => updateParam('department', event.target.value)}>
        <option value="">{t("Все подразделения")}</option>
        {reference.data.departments.map(item => <option key={item.id} value={item.id}>{referenceLabel(locale, 'department', item.id, item.name)}</option>)}
      </select></label>}
    </header>
    {trends && <div className="dashboard-toolbar">
      <p className="muted">{t("Данные на")} <time dateTime={trends.generatedAt}>{dateLabel(trends.generatedAt, locale)}</time></p>
      <button onClick={result.reload}>{t("Обновить")}</button>
    </div>}
    {result.loading && <Loading label={t("Загрузка дашборда…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {trends && totals && <>
      <CompletionSignal total={totals.total} closed={totals.closedCount} scope={department ? t("Выбранное подразделение") : undefined} />
      <div ref={revealPanel} className="dashboard-tiles reveal-panel">
        <Tile id="dash-total" title={t("Всего обращений")} value={number.format(totals.total)} note={t("С учётом закрытых")} />
        <Tile id="dash-open" title={t("Открытых")} value={number.format(totals.openCount)} note={`${t("Закрыто")} ${number.format(totals.closedCount)}`} />
        <Tile id="dash-overdue" title={t("Просрочено")} value={number.format(totals.overdueCount)} note={t("Срок прошёл, решения нет")} />
        <Tile id="dash-resolution" title={t("Среднее время решения")} value={totals.averageResolutionHours === null ? t("Нет закрытых") : `${number.format(totals.averageResolutionHours)} ${locale === 'en' ? 'h' : locale === 'kk' ? t("сағ") : t("ч")}`}
          note={t("От подачи до закрытия")} />
      </div>
      {empty && <p className="summary-empty" role="status">{t("Обращений пока нет — графики появятся после первой подачи.")}</p>}
      <div className="dashboard-grid dashboard-overview">
        {!empty && <section ref={revealPanel} className="dashboard-panel reveal-panel"><h2>{t("Обращения по дням")}</h2><p className="muted">{t("Последние 14 дней, UTC.")}</p>
          <figure className="dashboard-chart"><LineChart title={t("Обращения по дням")} days={trends.byDay} /></figure>
          <details><summary>{t("Таблица по дням")}</summary>
            <CountTable label={t("Обращения по дням")} head={t("Дата")} rows={trends.byDay.map(day => ({ key: day.date, name: shortDate(day.date), count: day.count }))} />
          </details>
        </section>}
        <section ref={revealPanel} className="dashboard-panel dashboard-overdue reveal-panel">
          <div className="dashboard-panel-heading"><h2>{t("Просроченные")}</h2><span className="dashboard-panel-count" aria-hidden="true">{number.format(totals.overdueCount)}</span></div>
          {trends.overdue.length === 0 ? <p>{t("Просроченных обращений нет.")}</p>
            : <ul className="overdue-list" aria-label={t("Просроченные обращения")}>{trends.overdue.map(item => <li key={item.id}>
              <div className="overdue-info">
                {role === 'manager' ? <Link to={`/queue/${encodeURIComponent(item.id)}`}>{item.number}</Link> : <span className="overdue-number">{item.number}</span>}
                <span className="muted">{referenceLabel(locale, 'category', item.categoryId, item.categoryName)}</span>
              </div>
              <span className="overdue-hours"><span className="visually-hidden">{t("просрочено на")} </span>{number.format(Math.round(item.overdueHours))} {t("ч")}</span>
            </li>)}</ul>}
          {role !== 'manager' && trends.overdue.length > 0 && <p className="muted">{t("Карточки открывает руководитель в очереди обращений.")}</p>}
        </section>
      </div>
      {!empty && <div className="dashboard-grid">
        <section ref={revealPanel} className="dashboard-panel reveal-panel"><h2><button type="button" className="dashboard-section-toggle" aria-expanded={categoriesOpen} aria-controls={categoriesId} onClick={() => setCategoriesOpen(open => !open)}>{t("По категориям")}<span aria-hidden="true">{categoriesOpen ? '⌃' : '⌄'}</span></button></h2>
          <div id={categoriesId} hidden={!categoriesOpen}>
            <label className="dashboard-category-sort">{t("Сортировка категорий")}<select value={categorySort} onChange={event => updateParam('categorySort', event.target.value)}>
              <option value="count">{t("По числу обращений")}</option><option value="name">{t("По алфавиту")}</option>
            </select></label>
            <figure className="dashboard-chart"><BarChart title={t("Обращения по категориям")} bars={visibleCategories.map(item => ({ label: item.name, value: item.count }))} />
              <figcaption className="chart-axis-note">{t("По горизонтали — число обращений")}</figcaption></figure>
            <CountTable label={t("Обращения по категориям")} head={t("Категория")} rows={visibleCategories} />
            {categoryRows.length > 8 && <button type="button" className="dashboard-show-categories" onClick={() => setShowAllCategories(all => !all)}>{showAllCategories ? t("Свернуть") : t("Показать все")}</button>}
          </div>
        </section>
        <section ref={revealPanel} className="dashboard-panel reveal-panel"><h2>{t("По подразделениям")}</h2>
          <figure className="dashboard-chart"><BarChart title={t("Обращения по подразделениям")} bars={trends.byDepartment.map(item => ({ label: referenceLabel(locale, 'department', item.departmentId, item.departmentName), value: item.count }))} />
            <figcaption className="chart-axis-note">{t("По горизонтали — число обращений")}</figcaption></figure>
          <CountTable label={t("Обращения по подразделениям")} head={t("Подразделение")} rows={trends.byDepartment.map(item => ({ key: item.departmentId, name: referenceLabel(locale, 'department', item.departmentId, item.departmentName), count: item.count }))} />
        </section>
      </div>}
    </>}
    <WeeklyDigest department={department} />
  </section>;
}
