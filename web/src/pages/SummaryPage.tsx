import { useCallback } from 'react';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, LoadError, typeLabels } from '../features/complaint';
import './summary.css';

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

export default function SummaryPage() {
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/summary')).data), [api]);
  const result = useResource(load);
  const summary = result.data;
  return <section className="section"><p className="eyebrow">Обзор обратной связи</p><h1>Сводка</h1>
    <p className="muted">Результаты рассмотрения и темы, к которым сотрудники возвращаются чаще.</p>
    {result.loading && <p role="status">Загрузка сводки…</p>}
    {result.error && <LoadError message={result.error} retry={result.reload} />}
    {summary && <>
      <div className="summary-toolbar"><p className="muted">Сводка на <time dateTime={summary.generatedAt}>{dateLabel(summary.generatedAt)}</time></p><button onClick={result.reload}>Обновить сводку</button></div>
      <div className="summary-metrics">
        <section className="metric-card" aria-labelledby="summary-total"><h2 id="summary-total">Всего обращений</h2><p className="metric-value">{number.format(summary.total)}</p><p className="muted">За всё время</p></section>
        <section className="metric-card" aria-labelledby="summary-closed"><h2 id="summary-closed">Доля закрытых</h2><p className="metric-value">{percent.format(summary.closedShare)}</p><p className="muted">Завершено {number.format(summary.closedCount)} из {number.format(summary.total)}. Включены реализованные, отклонённые и закрытые.</p></section>
        <section className="metric-card" aria-labelledby="summary-response"><h2 id="summary-response">Среднее время первого ответа</h2><p className="metric-value">{summary.averageFirstResponseHours === null ? 'Нет ответов' : `${number.format(summary.averageFirstResponseHours)} ч`}</p><p className="muted">{summary.respondedCount > 0 ? `По ${number.format(summary.respondedCount)} обращениям с первым ответом` : 'Показатель появится после первого ответа руководителя'}</p></section>
      </div>
      <div className="summary-sections">
        <section className="summary-table-panel"><h2>Обращения по типам</h2><table aria-label="Обращения по типам"><thead><tr><th scope="col">Тип</th><th scope="col">Количество</th></tr></thead><tbody>{summary.byType.map(item => <tr key={item.type}><th scope="row">{typeLabels[item.type]}</th><td>{number.format(item.count)}</td></tr>)}</tbody></table></section>
        <section className="summary-table-panel"><h2>Повторяющиеся темы</h2><p className="muted">Категории, в которых есть минимум два обращения.</p>{summary.recurringTopics.length === 0 ? <p>Повторяющихся тем пока нет.</p> : <table aria-label="Повторяющиеся темы"><thead><tr><th scope="col">Категория</th><th scope="col">Количество</th></tr></thead><tbody>{summary.recurringTopics.map(topic => <tr key={topic.categoryId}><th scope="row">{topic.categoryName}</th><td>{number.format(topic.count)}</td></tr>)}</tbody></table>}</section>
      </div>
    </>}
  </section>;
}
