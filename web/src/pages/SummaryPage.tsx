import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, typeLabels } from '../features/complaint';
import './summary.css';

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const hours = (value: number | null) => value === null ? '—' : `${number.format(value)} ч`;
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

export type Bar = { label: string; value: number };

/** «повторяется 2 раза», «5 раз», «21 раз» */
function timesLabel(count: number) {
  const mod10 = count % 10, mod100 = count % 100;
  const word = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'раза' : 'раз';
  return `повторяется ${number.format(count)} ${word}`;
}

const DEFAULT_WIDTH = 640, VALUE_WIDTH = 56, ROW = 40, BAR = 22, STACKED_ROW = 52, STACKED_BAR = 18;
/** Оценка ширины подписи при 14 px (кириллица в Inter/system-ui ≈ 7.5 px на символ) и отступ до столбца. */
const labelWidth = (label: string) => Math.ceil(label.length * 7.5) + 16;

/** Ширина контейнера в пикселях; без ResizeObserver (тесты, старые браузеры) — ширина по умолчанию. */
function useContainerWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Горизонтальная столбчатая диаграмма на чистом SVG (#197). 1 единица viewBox = 1 px экрана,
 * поэтому текст всегда 14 px. Если подписи не помещаются слева от столбцов, они переносятся над столбцами.
 * Таблица-альтернатива выводится рядом.
 */
export function BarChart({ title, bars }: { title: string; bars: Bar[] }) {
  const titleId = useId();
  const { ref, width } = useContainerWidth();
  const max = Math.max(0, ...bars.map(bar => bar.value));
  const labelColumn = Math.max(80, ...bars.map(bar => labelWidth(bar.label)));
  const stacked = labelColumn > width * 0.45;
  const left = stacked ? 0 : labelColumn;
  const track = Math.max(40, width - left - VALUE_WIDTH);
  const row = stacked ? STACKED_ROW : ROW;
  const barHeight = stacked ? STACKED_BAR : BAR;
  const height = bars.length * row;
  return <div ref={ref} className="bar-chart-frame">
    <svg className="bar-chart" role="img" aria-labelledby={titleId} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <title id={titleId}>{`${title}: ${bars.map(bar => `${bar.label} ${number.format(bar.value)}`).join(', ')}`}</title>
      {bars.map((bar, index) => {
        const filled = max > 0 ? Math.round((bar.value / max) * track) : 0;
        const y = index * row;
        const barY = stacked ? y + 24 : y + (ROW - BAR) / 2;
        return <g key={bar.label} data-bar={bar.label}>
          {stacked
            ? <text className="bar-label" x={0} y={y + 12} textAnchor="start" dominantBaseline="middle">{bar.label}</text>
            : <text className="bar-label" x={labelColumn - 12} y={y + ROW / 2} textAnchor="end" dominantBaseline="middle">{bar.label}</text>}
          <rect className="bar-track" x={left} y={barY} width={track} height={barHeight} rx={4} />
          <rect className="bar-fill" x={left} y={barY} width={filled} height={barHeight} rx={4} />
          <text className="bar-value" x={left + filled + 8} y={barY + barHeight / 2} dominantBaseline="middle">{number.format(bar.value)}</text>
        </g>;
      })}
    </svg>
  </div>;
}

export default function SummaryPage() {
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/summary')).data), [api]);
  const result = useResource(load);
  const summary = result.data;
  const [resetStep, setResetStep] = useState<'idle' | 'confirm' | 'busy' | 'unavailable'>('idle');
  const [resetMessage, setResetMessage] = useState<{ text: string; error: boolean } | null>(null);
  const resetDemo = async () => {
    setResetStep('busy'); setResetMessage(null);
    try {
      const done = requireData((await api.POST('/demo/reset')).data);
      setResetStep('idle'); setResetMessage({ text: `Демо сброшено: загружено ${number.format(done.loadedCount)} обращений.`, error: false });
      result.reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) { setResetStep('unavailable'); return; }
      setResetStep('idle'); setResetMessage({ text: error instanceof ApiError ? error.message : 'Не удалось сбросить демо. Повторите попытку.', error: true });
    }
  };
  const typeBars = summary?.byType.map(item => ({ label: typeLabels[item.type], value: item.count })) ?? [];
  const topicBars = summary?.recurringTopics.map(topic => ({ label: topic.categoryName, value: topic.count })) ?? [];
  return <section className="section"><p className="eyebrow">Обзор обратной связи</p><h1>Сводка</h1>
    <p className="muted">Результаты рассмотрения и темы, к которым сотрудники возвращаются чаще.</p>
    {result.loading && <Loading label="Загрузка сводки…" />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {summary && <>
      <div className="summary-toolbar"><p className="muted">Сводка на <time dateTime={summary.generatedAt}>{dateLabel(summary.generatedAt)}</time></p><button onClick={result.reload}>Обновить сводку</button></div>
      <div className="summary-reset">
        {resetStep === 'unavailable' ? <p className="muted">Недоступно в этой среде</p>
          : resetStep === 'idle' ? <button type="button" onClick={() => setResetStep('confirm')}>Сбросить демо</button>
          : <div role="group" aria-label="Подтверждение сброса демо" className="summary-reset-confirm">
            <p>Все изменения будут потеряны, данные вернутся к исходным. Продолжить?</p>
            <button type="button" onClick={resetDemo} disabled={resetStep === 'busy'}>Подтвердить сброс</button>{' '}
            <button type="button" onClick={() => setResetStep('idle')} disabled={resetStep === 'busy'}>Отмена</button>
          </div>}
        {resetMessage && (resetMessage.error ? <p role="alert">{resetMessage.text}</p> : <p role="status" className="muted">{resetMessage.text}</p>)}
      </div>
      <div className="summary-metrics">
        <section className="metric-card" aria-labelledby="summary-total"><h2 id="summary-total">Всего обращений</h2><p className="metric-value">{number.format(summary.total)}</p><p className="muted">За всё время</p></section>
        <section className="metric-card" aria-labelledby="summary-closed"><h2 id="summary-closed">Доля закрытых</h2><p className="metric-value">{percent.format(summary.closedShare)}</p><p className="muted">Завершено {number.format(summary.closedCount)} из {number.format(summary.total)}. Включены реализованные, отклонённые и закрытые.</p></section>
        <section className="metric-card" aria-labelledby="summary-response"><h2 id="summary-response">Среднее время первого ответа</h2><p className="metric-value">{summary.averageFirstResponseHours === null ? 'Нет ответов' : `${number.format(summary.averageFirstResponseHours)} ч`}</p><p className="muted">{summary.respondedCount > 0 ? `По ${number.format(summary.respondedCount)} обращениям с первым ответом` : 'Показатель появится после первого ответа руководителя'}</p></section>
      </div>
      {summary.overdueCount !== undefined && <section className="metric-card summary-overdue" aria-labelledby="summary-overdue"><h2 id="summary-overdue">{`Просрочено: ${number.format(summary.overdueCount)}`}</h2><p className="muted">Незавершённые обращения со сроком в прошлом.</p><Link to="/queue?overdue=1">Открыть просроченные в очереди</Link></section>}
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
        {summary.byDepartment && <section className="summary-table-panel"><h2>Обращения по подразделениям</h2>
          <table aria-label="Обращения по подразделениям"><thead><tr><th scope="col">Подразделение</th><th scope="col">Обращений</th><th scope="col">Закрыто</th><th scope="col">Доля закрытых</th></tr></thead><tbody>{summary.byDepartment.map(item => <tr key={item.departmentId}><th scope="row">{item.departmentName}</th><td>{number.format(item.count)}</td><td>{number.format(item.closedCount)}</td><td>{percent.format(item.closedShare)}</td></tr>)}</tbody></table>
        </section>}
        {summary.avgResolutionHoursByCategory && <section className="summary-table-panel"><h2>Время решения по категориям</h2>
          <table aria-label="Время решения по категориям"><thead><tr><th scope="col">Категория</th><th scope="col">Закрыто</th><th scope="col">Среднее время</th></tr></thead><tbody>{summary.avgResolutionHoursByCategory.map(item => <tr key={item.categoryId}><th scope="row">{item.categoryName}</th><td>{number.format(item.closedCount)}</td><td>{hours(item.averageResolutionHours)}</td></tr>)}</tbody></table>
        </section>}
      </div>
    </>}
  </section>;
}
