import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { localeNames, referenceLabel, useI18n } from '../i18n';
import { useSession } from '../app/session';
import { requireData, useResource } from './data';
import { dateLabel, Loading, LoadError } from './complaint';
import type { components } from '../api/client';
import './engagement.css';

type Improvement = components['schemas']['Improvement'];

/** Лента «Вы предложили — мы сделали»: обезличенные результаты, реализованные по обращениям. */
export function ImprovementsList({ items, limit }: { items: Improvement[]; limit?: number }) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(localeNames[locale]);
  const valid = items.filter(item => typeof item.key === 'string' && typeof item.implementedAt === 'string');
  const shown = limit ? valid.slice(0, limit) : valid;
  if (shown.length === 0) return <p className="muted">{t("Реализованных улучшений пока нет.")}</p>;
  return <ul className="improvement-list">{shown.map(item => <li key={item.key} className={item.mine ? 'improvement mine' : 'improvement'}>
    <div className="improvement-head">
      <strong>{item.problemTitle ?? referenceLabel(locale, 'category', item.categoryId, item.categoryName)}</strong>
      {item.mine && <span className="improvement-mine">{t("Это ваше обращение")}</span>}
    </div>
    <p className="preserve-lines">{item.result}</p>
    <p className="muted improvement-meta">
      {item.reportersCount > 1 && <>{t("Сообщили сотрудников: {count}", { count: number.format(item.reportersCount) })} · </>}
      {t("Подтвердили результат: {confirmed} из {answered}", { confirmed: number.format(item.confirmedCount), answered: number.format(item.answeredCount) })} · <time dateTime={item.implementedAt}>{dateLabel(item.implementedAt, locale)}</time>
    </p>
  </li>)}</ul>;
}

export function useImprovements() {
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/improvements')).data), [api]);
  return useResource(load);
}

/** Компактный блок для главной страницы: три последних улучшения и ссылка на всю ленту. */
export function ImprovementsTeaser() {
  const { t } = useI18n();
  const result = useImprovements();
  if (result.loading || result.error || !Array.isArray(result.data?.items) || !result.data.items.some(item => typeof item.key === 'string')) return null;
  return <section className="improvements-teaser" aria-labelledby="improvements-teaser-title">
    <h2 id="improvements-teaser-title">{t("Вы предложили — мы сделали")}</h2>
    <ImprovementsList items={result.data.items} limit={3} />
    <p><Link to="/improvements">{t("Вся лента улучшений")}</Link></p>
  </section>;
}

export function ImprovementsPage() {
  const { t } = useI18n();
  const result = useImprovements();
  return <section className="section improvements-page">
    <p className="eyebrow">{t("Результаты обратной связи")}</p><h1>{t("Вы предложили — мы сделали")}</h1>
    <p className="muted">{t("Что изменилось в компании по обращениям сотрудников. Лента обезличена: без текста обращений и имён.")}</p>
    {result.loading && <Loading label={t("Загрузка ленты…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {Array.isArray(result.data?.items) && <ImprovementsList items={result.data.items} />}
  </section>;
}
