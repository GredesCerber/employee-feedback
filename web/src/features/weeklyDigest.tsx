import { useCallback, useId } from 'react';
import { useSession } from '../app/session';
import { requireData, useResource } from './data';
import { dateLabel, LoadError } from './complaint';
import './weeklyDigest.css';

export function WeeklyDigest({ department }: { department: string }) {
  const { api } = useSession();
  const heading = useId();
  const load = useCallback(async () => {
    const data = requireData((await api.GET('/summary/digest', { params: { query: department ? { department } : {} } })).data);
    if (!data.text?.trim() || !Array.isArray(data.highlights) || !data.period
      || !['llm', 'template'].includes(data.source) || !Number.isFinite(Date.parse(data.generatedAt))) {
      throw new Error('Invalid digest response');
    }
    return data;
  }, [api, department]);
  const result = useResource(load);
  const digest = result.data;
  return <section className="dashboard-panel weekly-digest" aria-labelledby={heading}>
    <div className="digest-heading"><h2 id={heading}>Сводка за неделю</h2>
      {!result.loading && !result.error && <button type="button" aria-label="Обновить сводку за неделю" onClick={result.reload}>Обновить</button>}
    </div>
    {result.loading && <div className="digest-skeleton" aria-busy="true">
      <p role="status">Загрузка сводки…</p>
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </div>}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {digest && <>
      <p><span className="imitation-badge" title={digest.source === 'llm'
        ? 'Текст составила модель по агрегатам. Проверьте выводы по указанным числам.'
        : 'Шаблон по агрегатам: без ключа, при недоступной модели или пустом периоде.'}>
        {digest.source === 'llm' ? 'ИИ' : 'Шаблон (без ИИ)'}
      </span></p>
      <p className="digest-text">{digest.text}</p>
      {digest.highlights.length > 0 && <ul aria-label="Главное за неделю">{digest.highlights.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {digest.source === 'template' && <p className="field-hint">Без ИИ: ключ не настроен, модель недоступна или за период нет обращений.</p>}
      <p className="field-hint">Период: {dateLabel(digest.period.from)} — {dateLabel(digest.period.to)}.</p>
      <p className="field-hint">Сводка рассчитана на <time dateTime={digest.generatedAt}>{dateLabel(digest.generatedAt)}</time>. Повторный запрос может использовать кэш до 60 секунд.</p>
    </>}
  </section>;
}
