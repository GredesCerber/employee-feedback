import { useCallback, useId } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, typeLabels } from '../features/complaint';
import './summary.css';

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

export type Bar = { label: string; value: number };

/** «повторяется 2 раза», «5 раз», «21 раз» */
function timesLabel(count: number) {
  const mod10 = count % 10, mod100 = count % 100;
  const word = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'раза' : 'раз';
  return `повторяется ${number.format(count)} ${word}`;
}

const CHART_WIDTH = 640, LABEL_WIDTH = 230, VALUE_WIDTH = 56, ROW = 40, BAR = 22;

/** Горизонтальная столбчатая диаграмма на чистом SVG. Таблица-альтернатива выводится рядом. */
export function BarChart({ title, bars }: { title: string; bars: Bar[] }) {
  const titleId = useId();
  const max = Math.max(0, ...bars.map(bar => bar.value));
  const track = CHART_WIDTH - LABEL_WIDTH - VALUE_WIDTH;
  const height = bars.length * ROW;
  return <svg className="bar-chart" role="img" aria-labelledby={titleId} viewBox={`0 0 ${CHART_WIDTH} ${height}`} preserveAspectRatio="xMinYMin meet">
    <title id={titleId}>{`${title}: ${bars.map(bar => `${bar.label} ${number.format(bar.value)}`).join(', ')}`}</title>
    {bars.map((bar, index) => {
      const width = max > 0 ? Math.round((bar.value / max) * track) : 0;
      const y = index * ROW;
      return <g key={bar.label} data-bar={bar.label}>
        <text className="bar-label" x={LABEL_WIDTH - 12} y={y + ROW / 2} textAnchor="end" dominantBaseline="middle">{bar.label}</text>
        <rect className="bar-track" x={LABEL_WIDTH} y={y + (ROW - BAR) / 2} width={track} height={BAR} rx={4} />
        <rect className="bar-fill" x={LABEL_WIDTH} y={y + (ROW - BAR) / 2} width={width} height={BAR} rx={4} />
        <text className="bar-value" x={LABEL_WIDTH + width + 8} y={y + ROW / 2} dominantBaseline="middle">{number.format(bar.value)}</text>
      </g>;
    })}
  </svg>;
}

export default function SummaryPage() {
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/summary')).data), [api]);
  const result = useResource(load);
  const summary = result.data;
  const typeBars = summary?.byType.map(item => ({ label: typeLabels[item.type], value: item.count })) ?? [];
  const topicBars = summary?.recurringTopics.map(topic => ({ label: topic.categoryName, value: topic.count })) ?? [];
  return <section className="section"><p className="eyebrow">Обзор обратной связи</p><h1>Сводка</h1>
    <p className="muted">Результаты рассмотрения и темы, к которым сотрудники возвращаются чаще.</p>
    {result.loading && <Loading label="Загрузка сводки…" />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {summary && <>
      <div className="summary-toolbar"><p className="muted">Сводка на <time dateTime={summary.generatedAt}>{dateLabel(summary.generatedAt)}</time></p><button onClick={result.reload}>Обновить сводку</button></div>
      <div className="summary-metrics">
        <section className="metric-card" aria-labelledby="summary-total"><h2 id="summary-total">Всего обращений</h2><p className="metric-value">{number.format(summary.total)}</p><p className="muted">За всё время</p></section>
        <section className="metric-card" aria-labelledby="summary-closed"><h2 id="summary-closed">Доля закрытых</h2><p className="metric-value">{percent.format(summary.closedShare)}</p><p className="muted">Завершено {number.format(summary.closedCount)} из {number.format(summary.total)}. Включены реализованные, отклонённые и закрытые.</p></section>
        <section className="metric-card" aria-labelledby="summary-response"><h2 id="summary-response">Среднее время первого ответа</h2><p className="metric-value">{summary.averageFirstResponseHours === null ? 'Нет ответов' : `${number.format(summary.averageFirstResponseHours)} ч`}</p><p className="muted">{summary.respondedCount > 0 ? `По ${number.format(summary.respondedCount)} обращениям с первым ответом` : 'Показатель появится после первого ответа руководителя'}</p></section>
      </div>
      {summary.total === 0 && <p className="summary-empty" role="status">Обращений пока нет — диаграммы появятся после первой подачи.</p>}
      <div className="summary-sections">
        <section className="summary-table-panel"><h2>Обращения по типам</h2>
          {summary.total > 0 && <figure className="summary-chart"><BarChart title="Обращения по типам" bars={typeBars} /></figure>}
          <table aria-label="Обращения по типам"><thead><tr><th scope="col">Тип</th><th scope="col">Количество</th></tr></thead><tbody>{summary.byType.map(item => <tr key={item.type}><th scope="row">{typeLabels[item.type]}</th><td>{number.format(item.count)}</td></tr>)}</tbody></table>
        </section>
        <section className="summary-table-panel"><h2>Повторяющиеся темы</h2><p className="muted">Категории, в которых есть минимум два обращения.</p>
          {summary.recurringTopics.length === 0 ? <p>Повторяющихся тем пока нет.</p> : <>
            <figure className="summary-chart"><BarChart title="Повторяющиеся темы по категориям" bars={topicBars} /></figure>
            <ul className="topic-list" aria-label="Повторяющиеся темы">{summary.recurringTopics.map(topic => <li key={topic.categoryId}>
              <span className="topic-name">{topic.categoryName}</span> <span className="topic-count">{timesLabel(topic.count)}</span>{' '}
              <Link to={`/queue?categoryId=${encodeURIComponent(topic.categoryId)}`}>Открыть в очереди</Link>
            </li>)}</ul>
            <table aria-label="Повторяющиеся темы"><thead><tr><th scope="col">Категория</th><th scope="col">Количество</th></tr></thead><tbody>{summary.recurringTopics.map(topic => <tr key={topic.categoryId}><th scope="row">{topic.categoryName}</th><td>{number.format(topic.count)}</td></tr>)}</tbody></table>
          </>}
        </section>
      </div>
    </>}
  </section>;
}
