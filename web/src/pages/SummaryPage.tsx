import { useI18n, localeNames, referenceLabel, type Locale } from '../i18n';
import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, typeLabels } from '../features/complaint';
import { CompletionSignal } from '../features/CompletionSignal';
import { ChartCountUp, CountUp } from '../features/CountUp';
import { useRevealOnView } from '../features/designMotion';
import { RoutingRules } from '../features/routingRules';
import { buildSummaryCsv, isSummaryEmpty, summaryCsvFileName } from '../features/summaryCsv';
import { ChartHeader, CollapsiblePanel, ShowAllButton, useShowAll } from '../features/collapsiblePanel';
import { DonutChart } from '../features/donutChart';
import './summary.css';

const hours = (value: number | null, locale: Locale) => value === null ? '—' : `${new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 }).format(value)} ${locale === 'en' ? 'h' : locale === 'kk' ? 'сағ' : 'ч'}`;

export type Bar = { label: string; value: number };

const DEFAULT_WIDTH = 640, VALUE_WIDTH = 48, ROW = 34, BAR = 5, LABEL_LINE = 18;
/** Оценка ширины подписи Play при 14 px и отступ до столбца. */
const labelWidth = (label: string) => Math.ceil(label.length * 7.5) + 16;

/** Ширина контейнера в пикселях; без ResizeObserver (тесты, старые браузеры) — ширина по умолчанию. */
export function useContainerWidth() {
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

function labelLines(label: string, width: number) {
  const capacity = Math.max(8, Math.floor(width / 7.5));
  const words = label.split(/\s+/).flatMap(word => {
    const pieces: string[] = [];
    for (let index = 0; index < word.length; index += capacity) pieces.push(word.slice(index, index + capacity));
    return pieces;
  });
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (current && current.length + word.length + 1 <= capacity) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines.length ? lines : [''];
}

/**
 * Горизонтальная столбчатая диаграмма на чистом SVG (#197). 1 единица viewBox = 1 px экрана,
 * поэтому текст всегда 14 px. Если подписи не помещаются слева от столбцов, они переносятся над столбцами.
 * Таблица-альтернатива выводится рядом.
 */
export function BarChart({ title, bars, format }: { title: string; bars: Bar[]; format?: (value: number) => string }) {
  const { locale } = useI18n();
  const numberFormat = new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 });
  const number = { format: format ?? ((value: number) => numberFormat.format(value)) };
  const titleId = useId();
  const { ref, width } = useContainerWidth();
  const revealBar = useRevealOnView<SVGGElement>();
  const max = Math.max(0, ...bars.map(bar => bar.value));
  const labelColumn = Math.max(80, ...bars.map(bar => labelWidth(bar.label)));
  const stacked = width < 560 || labelColumn > width * 0.45;
  const left = stacked ? 0 : labelColumn;
  const track = Math.max(0, width - left - (stacked ? 0 : VALUE_WIDTH));
  let height = 0;
  const rows = bars.map(bar => {
    const lines = stacked ? labelLines(bar.label, width - VALUE_WIDTH) : [bar.label];
    const y = height;
    height += stacked ? 38 + (lines.length - 1) * LABEL_LINE : ROW;
    return { ...bar, lines, y };
  });
  return <div ref={ref} className="bar-chart-frame">
    <svg className="bar-chart" role="img" aria-labelledby={titleId} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <title id={titleId}>{`${title}: ${bars.map(bar => `${bar.label} ${number.format(bar.value)}`).join(', ')}`}</title>
      {rows.map(bar => {
        const filled = max > 0 ? Math.round((bar.value / max) * track) : 0;
        const barY = stacked ? bar.y + 21 + (bar.lines.length - 1) * LABEL_LINE : bar.y + (ROW - BAR) / 2;
        return <g key={bar.label} ref={revealBar} data-bar={bar.label}>
          {stacked
            ? <text className="bar-label" x={0} y={bar.y + 9} textAnchor="start" dominantBaseline="middle">{bar.lines.map((line, index) =>
              <tspan key={index} x={0} dy={index === 0 ? 0 : LABEL_LINE}>{index ? ` ${line}` : line}</tspan>)}</text>
            : <text className="bar-label" x={labelColumn - 12} y={bar.y + ROW / 2} textAnchor="end" dominantBaseline="middle">{bar.label}</text>}
          <rect className="bar-track" x={left} y={barY} width={track} height={BAR} rx={BAR / 2} />
          <rect className="bar-fill" x={left} y={barY} width={filled} height={BAR} rx={BAR / 2} />
          <ChartCountUp className="bar-value" x={width} y={stacked ? bar.y + 9 : barY + BAR / 2} textAnchor="end" dominantBaseline="middle"
            value={bar.value} format={Number.isInteger(bar.value) ? value => number.format(Math.round(value)) : number.format} />
        </g>;
      })}
    </svg>
  </div>;
}

export default function SummaryPage() {
  const revealPanel = useRevealOnView<HTMLElement>();
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(localeNames[locale], { style: 'percent', maximumFractionDigits: 1 });
  const count = (value: number) => number.format(Math.round(value));
  const hourUnit = { ru: 'ч', en: 'h', kk: 'сағ' }[locale];
  const { api, role } = useSession();
  const queueHint = { ru: 'Очередь доступна руководителю', en: 'The queue is available to managers', kk: 'Кезек басшыға қолжетімді' }[locale];
  const load = useCallback(async () => requireData((await api.GET('/summary')).data), [api]);
  const result = useResource(load);
  const summary = result.data;
  const [resetStep, setResetStep] = useState<'idle' | 'confirm' | 'busy' | 'unavailable'>('idle');
  const [resetMessage, setResetMessage] = useState<{ text: string; error: boolean } | null>(null);
  const resetDemo = async () => {
    setResetStep('busy'); setResetMessage(null);
    try {
      const done = requireData((await api.POST('/demo/reset')).data);
      setResetStep('idle'); setResetMessage({ text: t('Демо сброшено: загружено {count} обращений.', { count: number.format(done.loadedCount) }), error: false });
      result.reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) { setResetStep('unavailable'); return; }
      setResetStep('idle'); setResetMessage({ text: error instanceof ApiError ? error.message : 'Не удалось сбросить демо. Повторите попытку.', error: true });
    }
  };
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const emptyExport = t('Нет данных для выгрузки: обращений пока нет.');
  const downloadCsv = () => {
    if (!summary || isSummaryEmpty(summary)) { setExportMessage(emptyExport); return; }
    setExportMessage(null);
    const exportedAt = new Date();
    const csv = buildSummaryCsv(summary, {
      exportedAt, t,
      typeLabel: type => t(typeLabels[type]),
      categoryLabel: (id, name) => referenceLabel(locale, 'category', id, name),
      departmentLabel: (id, name) => referenceLabel(locale, 'department', id, name),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = summaryCsvFileName(exportedAt);
    document.body.append(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };
  const printSummary = () => {
    if (!summary || isSummaryEmpty(summary)) { setExportMessage(emptyExport); return; }
    setExportMessage(null);
    window.print();
  };
  const typeSlices = summary?.byType.map(item => ({ key: item.type, label: t(typeLabels[item.type]), value: item.count })) ?? [];
  const topicBars = summary?.recurringTopics.map(topic => ({ label: referenceLabel(locale, 'category', topic.categoryId, topic.categoryName), value: topic.count })) ?? [];
  const departmentBars = summary?.byDepartment?.map(item => ({ label: referenceLabel(locale, 'department', item.departmentId, item.departmentName), value: item.count })) ?? [];
  const resolutionBars = (summary?.avgResolutionHoursByCategory ?? []).flatMap(item => item.closedCount > 0 && item.averageResolutionHours !== null
    ? [{ label: referenceLabel(locale, 'category', item.categoryId, item.categoryName), value: item.averageResolutionHours }] : [])
    .sort((a, b) => b.value - a.value);
  const topics = useShowAll(topicBars), departments = useShowAll(departmentBars), resolution = useShowAll(resolutionBars);
  const showLabel = { more: t("Показать все"), less: t("Свернуть") };
  return <section className="section summary-page"><p className="eyebrow">{t("Обзор обратной связи")}</p><h1>{t("Сводка")}</h1>
    <p className="muted">{t("Результаты рассмотрения и темы, к которым сотрудники возвращаются чаще.")}</p>
    {result.loading && <Loading label={t("Загрузка сводки…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {summary && <>
      <CompletionSignal total={summary.total} closed={summary.closedCount} />
      <div className="summary-toolbar"><p className="muted">{t("Сводка на")} <time dateTime={summary.generatedAt}>{dateLabel(summary.generatedAt, locale)}</time></p><div className="summary-actions" role="group" aria-label={t("Экспорт сводки")}><button type="button" onClick={downloadCsv}>{t("Скачать CSV")}</button><button type="button" onClick={printSummary}>{t("Печать")}</button><button onClick={result.reload}>{t("Обновить сводку")}</button></div></div>
      {exportMessage && <p className="summary-export-message" role="status">{exportMessage}</p>}
      <div className="summary-reset">
        {resetStep === 'unavailable' ? <p className="muted">{t("Недоступно в этой среде")}</p>
          : resetStep === 'idle' ? <button type="button" className="danger-button" onClick={() => setResetStep('confirm')}>{t("Сбросить демо")}</button>
          : <div role="group" aria-label={t("Подтверждение сброса демо")} className="summary-reset-confirm">
            <p>{t("Все изменения будут потеряны, данные вернутся к исходным. Продолжить?")}</p>
            <button type="button" className="danger-button" onClick={resetDemo} disabled={resetStep === 'busy'} aria-busy={resetStep === 'busy'}>{t("Подтвердить сброс")}</button>{' '}
            <button type="button" onClick={() => setResetStep('idle')} disabled={resetStep === 'busy'}>{t("Отмена")}</button>
          </div>}
        {resetMessage && (resetMessage.error ? <p role="alert">{resetMessage.text}</p> : <p role="status" className="muted">{resetMessage.text}</p>)}
      </div>
      <div ref={revealPanel} className="summary-metrics reveal-panel">
        <section className="metric-card" aria-labelledby="summary-total"><h2 id="summary-total">{t("Всего обращений")}</h2><p className="metric-value"><CountUp value={summary.total} format={count} /></p><p className="muted">{t("За всё время")}</p></section>
        <section className="metric-card" aria-labelledby="summary-closed"><h2 id="summary-closed">{t("Доля закрытых")}</h2><p className="metric-value"><CountUp value={summary.closedShare} format={percent.format} /></p><p className="muted">{t("Завершено")} {number.format(summary.closedCount)} {t("из")} {number.format(summary.total)}{t(". Включены реализованные, отклонённые и закрытые.")}</p></section>
        <section className="metric-card" aria-labelledby="summary-response"><h2 id="summary-response">{t("Среднее время первого ответа")}</h2><p className="metric-value">{summary.averageFirstResponseHours === null ? t("Нет ответов") : <CountUp value={summary.averageFirstResponseHours} format={value => number.format(value) + ' ' + hourUnit} />}</p><p className="muted">{summary.respondedCount > 0 ? `По ${number.format(summary.respondedCount)} обращениям с первым ответом` : t("Показатель появится после первого ответа руководителя")}</p></section>
        {summary.overdueCount !== undefined && <section className="metric-card summary-overdue" aria-labelledby="summary-overdue"><h2 id="summary-overdue">{t("Просрочено")}<span className="visually-hidden">: {number.format(summary.overdueCount)}</span></h2><p className="metric-value" aria-hidden="true"><CountUp value={summary.overdueCount} format={count} /></p><p className="muted">{t("Срок прошёл, решения нет.")}</p>{role === 'admin' ? <span className="muted">{queueHint}</span> : <Link to="/queue?overdue=1">{t("Открыть просроченные в очереди")}</Link>}</section>}
      </div>
      {summary.total === 0 && <p className="summary-empty" role="status">{t("Обращений пока нет — диаграммы появятся после первой подачи.")}</p>}
      <div className="summary-sections">
        <div className="summary-column">
        <CollapsiblePanel id="summary-types" panelRef={revealPanel} className="summary-table-panel reveal-panel" title={t("Обращения по типам")}>
          {summary.total > 0 && <figure className="summary-chart"><DonutChart title={t("Обращения по типам")} slices={typeSlices} /></figure>}
          {/* Те же числа, что в диаграмме: таблица только для экранных читалок. */}<div className="visually-hidden"><table aria-label={t("Обращения по типам")}><thead><tr><th scope="col">{t("Тип")}</th><th scope="col">{t("Количество")}</th></tr></thead><tbody>{summary.byType.map(item => <tr key={item.type}><th scope="row">{t(typeLabels[item.type])}</th><td>{number.format(item.count)}</td></tr>)}</tbody></table></div>
        </CollapsiblePanel>
        <CollapsiblePanel id="summary-topics" panelRef={revealPanel} className="summary-table-panel reveal-panel" title={t("Повторяющиеся темы")}>
          <p className="muted">{t("Категории, в которых есть минимум два обращения.")}</p>
          {summary.recurringTopics.length === 0 ? <p>{t("Повторяющихся тем пока нет.")}</p> : <>
            <figure className="summary-chart"><ChartHeader label={t("Категория")} value={t("Количество")} /><BarChart title={t("Повторяющиеся темы по категориям")} bars={topics.visible} /></figure>
            {topics.more && <ShowAllButton all={topics.all} toggle={topics.toggle} label={showLabel} />}
            {role === 'admin' ? <p className="muted topic-hint">{queueHint}</p>
              : <ul className="topic-links" aria-label={t("Открыть в очереди")}>{summary.recurringTopics.slice(0, topics.visible.length).map(topic => <li key={topic.categoryId}>
                <Link to={`/queue?categoryId=${encodeURIComponent(topic.categoryId)}`}>{referenceLabel(locale, 'category', topic.categoryId, topic.categoryName)}</Link>
              </li>)}</ul>}
            {/* Те же данные, что в диаграмме: таблица остаётся для экранных читалок и не дублирует диаграмму на экране. */}<div className="visually-hidden"><table aria-label={t("Повторяющиеся темы")}><thead><tr><th scope="col">{t("Категория")}</th><th scope="col">{t("Количество")}</th></tr></thead><tbody>{summary.recurringTopics.map(topic => <tr key={topic.categoryId}><th scope="row">{referenceLabel(locale, 'category', topic.categoryId, topic.categoryName)}</th><td>{number.format(topic.count)}</td></tr>)}</tbody></table></div>
          </>}
        </CollapsiblePanel>
        </div>
        <div className="summary-column">
        {summary.avgResolutionHoursByCategory && <CollapsiblePanel id="summary-resolution" panelRef={revealPanel} className="summary-table-panel reveal-panel" title={t("Время решения по категориям")}>
          {resolutionBars.length === 0 ? <p>{t("Закрытых обращений пока нет.")}</p> : <>
            <figure className="summary-chart"><ChartHeader label={t("Категория")} value={t("Среднее время")} /><BarChart title={t("Время решения по категориям")} bars={resolution.visible} format={value => hours(value, locale)} /></figure>
            {resolution.more && <ShowAllButton all={resolution.all} toggle={resolution.toggle} label={showLabel} />}
          </>}
          {resolutionBars.length < summary.avgResolutionHoursByCategory.length && <p className="muted">{t("Остальные категории: закрытых обращений пока нет.")}</p>}
          <div className="visually-hidden"><table aria-label={t("Время решения по категориям")}><thead><tr><th scope="col">{t("Категория")}</th><th scope="col">{t("Закрыто")}</th><th scope="col">{t("Среднее время")}</th></tr></thead><tbody>{summary.avgResolutionHoursByCategory.map(item => <tr key={item.categoryId}><th scope="row">{referenceLabel(locale, 'category', item.categoryId, item.categoryName)}</th><td>{number.format(item.closedCount)}</td><td>{hours(item.averageResolutionHours, locale)}</td></tr>)}</tbody></table></div>
        </CollapsiblePanel>}
        {summary.byDepartment && <CollapsiblePanel id="summary-departments" panelRef={revealPanel} className="summary-table-panel reveal-panel" title={t("Обращения по подразделениям")}>
          <figure className="summary-chart"><ChartHeader label={t("Подразделение")} value={t("Количество")} /><BarChart title={t("Обращения по подразделениям")} bars={departments.visible} /></figure>
          {departments.more && <ShowAllButton all={departments.all} toggle={departments.toggle} label={showLabel} />}
          {/* Полные данные (закрыто, доля закрытых) — для экранных читалок. */}<div className="visually-hidden"><table aria-label={t("Обращения по подразделениям")}><thead><tr><th scope="col">{t("Подразделение")}</th><th scope="col">{t("Обращений")}</th><th scope="col">{t("Закрыто")}</th><th scope="col">{t("Доля закрытых")}</th></tr></thead><tbody>{summary.byDepartment.map(item => <tr key={item.departmentId}><th scope="row">{referenceLabel(locale, 'department', item.departmentId, item.departmentName)}</th><td>{number.format(item.count)}</td><td>{number.format(item.closedCount)}</td><td>{percent.format(item.closedShare)}</td></tr>)}</tbody></table></div>
        </CollapsiblePanel>}
        </div>
        {role === 'admin' && <RoutingRules />}
      </div>
    </>}
  </section>;
}
