import { useI18n, digestTemplate } from '../i18n';
import { useCallback, useId, useState } from 'react';
import { useSession } from '../app/session';
import { requireData, useResource } from './data';
import { dateLabel, LoadError } from './complaint';
import './weeklyDigest.css';

export function WeeklyDigest({ department }: { department: string }) {
  const { t, locale } = useI18n();
  const { api } = useSession();
  const heading = useId();
  const content = useId();
  const [open, setOpen] = useState(true);
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
    <div className="digest-heading"><h2 id={heading}><button type="button" className="dashboard-section-toggle" aria-expanded={open} aria-controls={content} onClick={() => setOpen(value => !value)}>{t("Сводка за неделю")}<span aria-hidden="true">{open ? '⌃' : '⌄'}</span></button></h2></div>
    <div id={content} hidden={!open}>
    {!result.loading && !result.error && <button type="button" aria-label={t("Обновить сводку за неделю")} onClick={result.reload}>{t("Обновить")}</button>}
    {result.loading && <div className="digest-skeleton" aria-busy="true">
      <p role="status">{t("Загрузка сводки…")}</p>
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </div>}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {digest && <>
      <p><span className="imitation-badge" title={digest.source === 'llm'
        ? t("Текст составила модель по агрегатам. Проверьте выводы по указанным числам.")
        : t("Шаблон по агрегатам: без ключа, при недоступной модели или пустом периоде.")}>
        {digest.source === 'llm' ? t("ИИ") : t("Шаблон (без ИИ)")}
      </span></p>
      <p className="digest-text">{digest.source === 'template' ? digestTemplate(locale, digest.text) : digest.text}</p>
      {digest.highlights.length > 0 && <ul aria-label={t("Главное за неделю")}>{digest.highlights.map((item, index) => <li key={index}>{digest.source === 'template' ? digestTemplate(locale, item) : item}</li>)}</ul>}
      {digest.source === 'template' && <p className="field-hint">{t("Без ИИ: ключ не настроен, модель недоступна или за период нет обращений.")}</p>}
      <p className="field-hint">{t("Период:")} {dateLabel(digest.period.from, locale)} — {dateLabel(digest.period.to, locale)}.</p>
      <p className="field-hint">{t("Сводка рассчитана на")} <time dateTime={digest.generatedAt}>{dateLabel(digest.generatedAt, locale)}</time>{t(". Повторный запрос может использовать кэш до 60 секунд.")}</p>
    </>}
    </div>
  </section>;
}
