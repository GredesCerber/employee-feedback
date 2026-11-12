import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { localeNames, referenceLabel, useI18n } from '../i18n';
import { useSession } from '../app/session';
import { requireData, useResource } from './data';
import { Loading, LoadError } from './complaint';
import type { components } from '../api/client';
import './engagement.css';

type Period = components['schemas']['ImpactPeriod'];
const PERIODS = [7, 14, 30] as const;

/** Панель эффекта пилота: охват, доля рассмотренных, подтверждённые решения и изменения к прошлому периоду. */
export function ImpactPanel() {
  const { t, locale } = useI18n();
  const { api } = useSession();
  const [days, setDays] = useState<number>(7);
  const load = useCallback(async () => requireData((await api.GET('/impact', { params: { query: { days } } })).data), [api, days]);
  const result = useResource(load);
  const number = new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 });
  const percent = (value: number | null) => value === null ? t("Нет данных") : new Intl.NumberFormat(localeNames[locale], { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const delta = (now: number | null, before: number | null, share = false) => {
    if (now === null || before === null) return '';
    const diff = share ? Math.round((now - before) * 100) : now - before;
    return diff === 0 ? t("без изменений") : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}${share ? t(" п.п.") : ''}`;
  };
  const data = result.data?.current && result.data.previous ? result.data : undefined;
  const rows: { key: string; label: string; value: (period: Period) => string; change: (a: Period, b: Period) => string }[] = [
    { key: 'total', label: t("Обращений за период"), value: p => number.format(p.total), change: (a, b) => delta(a.total, b.total) },
    { key: 'reach', label: t("Охват сотрудников"), value: p => `${number.format(p.reachEmployees)} / ${number.format(p.employeesTotal)}`, change: (a, b) => delta(a.reachEmployees, b.reachEmployees) },
    { key: 'reviewed', label: t("Доля рассмотренных"), value: p => percent(p.reviewedShare), change: (a, b) => delta(a.reviewedShare, b.reviewedShare, true) },
    { key: 'implemented', label: t("Внедрённых улучшений"), value: p => number.format(p.implementedCount), change: (a, b) => delta(a.implementedCount, b.implementedCount) },
    { key: 'understood', label: t("Ответ понятен (по оценкам авторов)"), value: p => percent(p.understoodShare), change: (a, b) => delta(a.understoodShare, b.understoodShare, true) },
    { key: 'solved', label: t("Проблема решена (подтвердили авторы)"), value: p => percent(p.solvedShare), change: (a, b) => delta(a.solvedShare, b.solvedShare, true) },
  ];
  const shifts = (Array.isArray(data?.categories) ? data.categories : []).filter(item => item.current !== item.previous).slice(0, 3);
  return <section className="dashboard-panel impact-panel" aria-labelledby="impact-title">
    <div className="dashboard-panel-heading"><h2 id="impact-title">{t("Эффект пилота")}</h2>
      <label className="impact-period">{t("Период")}<select value={days} onChange={event => setDays(Number(event.target.value))}>
        {PERIODS.map(value => <option key={value} value={value}>{t("{count} дней", { count: value })}</option>)}</select></label></div>
    <p className="muted">{t("Сравнение с предыдущим таким же периодом. Данные синтетические.")}</p>
    {result.loading && <Loading label={t("Загрузка эффекта…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {data && <>
      <table aria-label={t("Эффект пилота")}><thead><tr><th scope="col">{t("Показатель")}</th><th scope="col">{t("Сейчас")}</th><th scope="col">{t("Было")}</th><th scope="col">{t("Изменение")}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.value(data.current)}</td><td>{row.value(data.previous)}</td><td>{row.change(data.current, data.previous)}</td></tr>)}</tbody></table>
      {shifts.length > 0 && <ul className="impact-shifts" aria-label={t("Изменения по темам")}>{shifts.map(item => <li key={item.categoryId}>
        {item.current > item.previous
          ? t("Обращений по теме «{name}» стало больше: {previous} → {current}.", { name: referenceLabel(locale, 'category', item.categoryId, item.categoryName), previous: item.previous, current: item.current })
          : t("Обращений по теме «{name}» стало меньше: {previous} → {current}.", { name: referenceLabel(locale, 'category', item.categoryId, item.categoryName), previous: item.previous, current: item.current })}
      </li>)}</ul>}
    </>}
    <p><Link to="/improvements">{t("Лента «Вы предложили — мы сделали»")}</Link></p>
  </section>;
}
