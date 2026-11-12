import { referenceLabel, systemText, useI18n, type Locale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { components } from '../api/client';
import { dateLabel, type Complaint } from './complaint';
import { fallbackQueueHint } from './complaintMeta';
import '../pages/complaint.css';

type ReferenceData = components['schemas']['ReferenceData'];
const terminal: readonly Complaint['status'][] = ['implemented', 'rejected', 'closed'];
const dayMs = 24 * 60 * 60 * 1000;

/** Сколько календарных дней до срока (округление вверх); отрицательное — срок прошёл. null, если дата нечитаема. */
export function daysUntil(dueAt: string, now = Date.now()): number | null {
  const due = Date.parse(dueAt);
  return Number.isFinite(due) ? Math.ceil((due - now) / dayMs) : null;
}

/** Ответственный с подразделением из справочника; без назначения — честное «ещё не назначен». */
export function ownerLabel(item: Pick<Complaint, 'assignee'>, locale: Locale, departments?: ReferenceData['departments']): string | null {
  if (!item.assignee) return null;
  const { name, departmentId } = item.assignee;
  const department = departments?.find(entry => entry.id === departmentId)?.name;
  return department ? `${name} · ${referenceLabel(locale, 'department', departmentId, department)}` : name;
}

function DueRelative({ item }: { item: Pick<Complaint, 'dueAt' | 'overdue'> }) {
  const { t } = useI18n();
  const days = daysUntil(item.dueAt);
  if (days === null) return null;
  if (item.overdue || days < 0) return <span className="follow-up-relative is-overdue">{t('срок прошёл')}</span>;
  return <span className="follow-up-relative">{days <= 0 ? t('срок сегодня') : t('осталось дней: {count}', { count: days })}</span>;
}

/**
 * «Что будет дальше» (#312 A6): конкретный срок и ответственный из данных API (dueAt, assignee, правило категории dueInDays).
 * Чего в API нет — не придумываем: без ответственного так и пишем.
 */
export function WhatNext({ item, reference, headingLevel = 2 }: { item: Complaint; reference?: ReferenceData; headingLevel?: 2 | 3 }) {
  const { t, locale } = useI18n();
  const Heading = `h${headingLevel}` as const;
  const owner = ownerLabel(item, locale, reference?.departments);
  const validDue = daysUntil(item.dueAt) !== null;
  const dueInDays = reference?.categories.find(category => category.id === item.categoryId)?.dueInDays;
  return <section className="what-next" aria-labelledby={`what-next-${item.id}`}>
    <Heading id={`what-next-${item.id}`}>{t('Что будет дальше')}</Heading>
    <p className="what-next-action">{systemText(locale, item.nextAction)}</p>
    <dl className="metadata registration-meta">
      <div><dt>{t('Ответственный')}</dt><dd>{owner ?? t('Ожидает назначения')}</dd></div>
      <div><dt>{t('Срок')}</dt><dd>{validDue ? <>{t('до {date}', { date: dateLabel(item.dueAt, locale) })} <DueRelative item={item} /></> : t('Срок не указан')}</dd></div>
    </dl>
    {!item.assignee && <p className="fallback-queue-hint what-next-note">{t(fallbackQueueHint)}</p>}
    {validDue && dueInDays !== undefined && <p className="muted what-next-note">{t('Срок рассчитан по правилу категории: {count} календарных дней от подачи.', { count: dueInDays })}</p>}
  </section>;
}

/** Короткая строка «до какого числа и кто отвечает» для карточки; на итоговых статусах не показывается. */
export function DeadlineOwnerLine({ item, reference }: { item: Complaint; reference?: ReferenceData }) {
  const { t, locale } = useI18n();
  if (terminal.includes(item.status) || daysUntil(item.dueAt) === null) return null;
  const owner = ownerLabel(item, locale, reference?.departments);
  return <p className="follow-up-line">
    {t('Срок ответа: до {date}', { date: dateLabel(item.dueAt, locale) })} <DueRelative item={item} />
    {' · '}{owner ? t('отвечает: {name}', { name: owner }) : t('ответственный ещё не назначен')}
  </p>;
}

/**
 * «Копировать номер» (#312 A8). navigator.clipboard, подтверждение через aria-live.
 * Если буфер обмена недоступен (нет API, нет прав, не https) — выделяем номер, чтобы скопировать вручную.
 */
export function CopyNumber({ number, targetId }: { number: string; targetId?: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function announce(text: string, clearAfter?: number) {
    clearTimeout(timer.current);
    setMessage(text);
    if (clearAfter) timer.current = setTimeout(() => setMessage(''), clearAfter);
  }
  function selectManually() {
    const node = targetId ? document.getElementById(targetId) : null;
    const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
    if (node && selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    announce(t('Не удалось скопировать автоматически. Номер {number} выделен — скопируйте его вручную (Ctrl+C).', { number }));
  }
  async function copy() {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) { selectManually(); return; }
    try { await clipboard.writeText(number); announce(t('Скопировано'), 4000); }
    catch { selectManually(); }
  }
  return <span className="copy-number">
    <button type="button" className="copy-number-button" onClick={() => { void copy(); }} aria-describedby={targetId}>{t('Копировать номер')}</button>
    <span className="copy-number-status" role="status" aria-live="polite">{message}</span>
  </span>;
}
