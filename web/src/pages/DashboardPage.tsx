import { useCallback, useId } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import type { components } from '../api/client';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError } from '../features/complaint';
import { BarChart } from './SummaryPage';
import { WeeklyDigest } from '../features/weeklyDigest';
import './dashboard.css';

type DayCount = components['schemas']['DayCount'];
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** «2026-11-10» → «10.11» без перевода часового пояса: даты в ответе уже в UTC. */
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

const LINE = { width: 640, height: 260, left: 56, right: 16, top: 16, bottom: 56 };

/** Линейный график «обращения по дням» на чистом SVG: оси с подписями, точки, таблица-альтернатива рядом. */
function LineChart({ title, days }: { title: string; days: DayCount[] }) {
  const titleId = useId();
  const max = Math.max(1, ...days.map(day => day.count));
  const plotWidth = LINE.width - LINE.left - LINE.right, plotHeight = LINE.height - LINE.top - LINE.bottom;
  const x = (index: number) => LINE.left + (days.length > 1 ? (index / (days.length - 1)) * plotWidth : plotWidth / 2);
  const y = (value: number) => LINE.top + plotHeight - (value / max) * plotHeight;
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const baseline = LINE.top + plotHeight;
  return <svg className="line-chart" role="img" aria-labelledby={titleId} viewBox={`0 0 ${LINE.width} ${LINE.height}`} preserveAspectRatio="xMinYMin meet">
    <title id={titleId}>{`${title}: ${days.map(day => `${shortDate(day.date)} — ${number.format(day.count)}`).join(', ')}`}</title>
    {ticks.map(tick => <g key={tick}>
      <line className="chart-grid" x1={LINE.left} x2={LINE.width - LINE.right} y1={y(tick)} y2={y(tick)} />
      <text className="chart-tick" x={LINE.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{number.format(tick)}</text>
    </g>)}
    <line className="chart-axis" x1={LINE.left} x2={LINE.width - LINE.right} y1={baseline} y2={baseline} />
    <line className="chart-axis" x1={LINE.left} x2={LINE.left} y1={LINE.top} y2={baseline} />
    {days.map((day, index) => index % 2 === days.length % 2 ? null
      : <text key={day.date} className="chart-tick" x={x(index)} y={baseline + 18} textAnchor="middle">{shortDate(day.date)}</text>)}
    <polyline className="line-path" points={days.map((day, index) => `${x(index)},${y(day.count)}`).join(' ')} />
    {days.map((day, index) => <circle key={day.date} data-point={day.date} className="line-point" cx={x(index)} cy={y(day.count)} r={4} />)}
    <text className="chart-axis-title" x={LINE.left + plotWidth / 2} y={LINE.height - 6} textAnchor="middle">Дата</text>
    <text className="chart-axis-title" x={14} y={LINE.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${LINE.top + plotHeight / 2})`}>Обращений</text>
  </svg>;
}

function CountTable({ label, head, rows }: { label: string; head: string; rows: { key: string; name: string; count: number }[] }) {
  return <table className="dashboard-table" aria-label={label}><thead><tr><th scope="col">{head}</th><th scope="col">Количество</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.name}</th><td>{number.format(row.count)}</td></tr>)}</tbody></table>;
}

function Tile({ id, title, value, note }: { id: string; title: string; value: string; note: string }) {
  return <section className="metric-card" aria-labelledby={id}><h2 id={id}>{title}</h2><p className="metric-value">{value}</p><p className="muted">{note}</p></section>;
}

export default function DashboardPage() {
  const { api, role } = useSession();
  const [params, setParams] = useSearchParams();
  const department = params.get('department')?.trim() ?? '';
  const loadReference = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(loadReference);
  const loadTrends = useCallback(async () => requireData((await api.GET('/analytics/trends', {
    params: { query: department ? { department } : {} },
  })).data), [api, department]);
  const result = useResource(loadTrends);
  const trends = result.data;
  const totals = trends?.totals;
  const empty = totals?.total === 0;
  function selectDepartment(value: string) {
    setParams(value ? { department: value } : {}, { replace: true });
  }
  return <section className="section"><p className="eyebrow">Обзор для руководителя</p><h1>Дашборд</h1>
    <p className="muted">Где копятся обращения и что уже просрочено.</p>
    <div className="dashboard-toolbar">
      {reference.data && <label>Подразделение<select value={department} onChange={event => selectDepartment(event.target.value)}>
        <option value="">Все подразделения</option>
        {reference.data.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      {trends && <p className="muted">Данные на <time dateTime={trends.generatedAt}>{dateLabel(trends.generatedAt)}</time></p>}
      {trends && <button onClick={result.reload}>Обновить</button>}
    </div>
    <WeeklyDigest department={department} />
    {result.loading && <Loading label="Загрузка дашборда…" />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {trends && totals && <>
      <div className="dashboard-tiles">
        <Tile id="dash-total" title="Всего обращений" value={number.format(totals.total)} note="С учётом закрытых" />
        <Tile id="dash-open" title="Открытых" value={number.format(totals.openCount)} note={`Закрыто ${number.format(totals.closedCount)}`} />
        <Tile id="dash-overdue" title="Просрочено" value={number.format(totals.overdueCount)} note="Срок прошёл, решения нет" />
        <Tile id="dash-resolution" title="Среднее время решения" value={totals.averageResolutionHours === null ? 'Нет закрытых' : `${number.format(totals.averageResolutionHours)} ч`}
          note="От подачи до закрытия" />
      </div>
      {empty && <p className="summary-empty" role="status">Обращений пока нет — графики появятся после первой подачи.</p>}
      <div className="dashboard-grid">
        {!empty && <section className="dashboard-panel dashboard-wide"><h2>Обращения по дням</h2><p className="muted">Последние 14 дней, UTC.</p>
          <figure className="dashboard-chart"><LineChart title="Обращения по дням" days={trends.byDay} /></figure>
          <details><summary>Таблица по дням</summary>
            <CountTable label="Обращения по дням" head="Дата" rows={trends.byDay.map(day => ({ key: day.date, name: shortDate(day.date), count: day.count }))} />
          </details>
        </section>}
        {!empty && <section className="dashboard-panel"><h2>По категориям</h2>
          <figure className="dashboard-chart"><BarChart title="Обращения по категориям" bars={trends.byCategory.map(item => ({ label: item.categoryName, value: item.count }))} />
            <figcaption className="chart-axis-note">По горизонтали — число обращений</figcaption></figure>
          <CountTable label="Обращения по категориям" head="Категория" rows={trends.byCategory.map(item => ({ key: item.categoryId, name: item.categoryName, count: item.count }))} />
        </section>}
        {!empty && <section className="dashboard-panel"><h2>По подразделениям</h2>
          <figure className="dashboard-chart"><BarChart title="Обращения по подразделениям" bars={trends.byDepartment.map(item => ({ label: item.departmentName, value: item.count }))} />
            <figcaption className="chart-axis-note">По горизонтали — число обращений</figcaption></figure>
          <CountTable label="Обращения по подразделениям" head="Подразделение" rows={trends.byDepartment.map(item => ({ key: item.departmentId, name: item.departmentName, count: item.count }))} />
        </section>}
        <section className="dashboard-panel dashboard-wide"><h2>Просроченные</h2>
          {trends.overdue.length === 0 ? <p>Просроченных обращений нет.</p>
            : <ul className="overdue-list" aria-label="Просроченные обращения">{trends.overdue.map(item => <li key={item.id}>
              {role === 'manager' ? <Link to={`/queue/${encodeURIComponent(item.id)}`}>{item.number}</Link> : <span className="overdue-number">{item.number}</span>}
              <span>{item.categoryName}</span>
              <span className="overdue-hours">просрочено на {number.format(Math.round(item.overdueHours))} ч</span>
            </li>)}</ul>}
          {role !== 'manager' && trends.overdue.length > 0 && <p className="muted">Карточки открывает руководитель в очереди обращений.</p>}
        </section>
      </div>
    </>}
  </section>;
}
