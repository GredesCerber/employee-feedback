import { useI18n, localeNames, localizeError, type Locale } from '../i18n';
import { useEffect, useState } from 'react';
import type { components } from '../api/client';
import { useCooldown } from './data';

export type Complaint = components['schemas']['Complaint'];
export const statusLabels: Record<Complaint['status'], string> = {
  new: 'Новое', in_review: 'На рассмотрении', in_progress: 'В работе',
  awaiting_clarification: 'Ожидает уточнения', implemented: 'Реализовано', rejected: 'Отклонено', closed: 'Закрыто',
};
export const typeLabels: Record<Complaint['type'], string> = { problem: 'Проблема', suggestion: 'Предложение', praise: 'Благодарность' };
export function dateLabel(value: string, locale: Locale = 'ru') {
  return new Intl.DateTimeFormat(localeNames[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
export function StatusBadge({ status }: { status: Complaint['status'] }) {
  const { t } = useI18n();
  return <span className={`status-badge status-${status}`}>{t(statusLabels[status])}</span>;
}
/** Ошибка загрузки с «Повторить». После 429 кнопка заблокирована на время из Retry-After. */
export function LoadError({ message, retry, retryAfter }: { message: string; retry: () => void; retryAfter?: number }) {
  const { t, locale } = useI18n();
  const cooldown = useCooldown(retryAfter);
  const text = retryAfter === undefined ? message : cooldown.active ? cooldown.message : 'Можно повторить запрос.';
  return <div className="load-error"><p role="alert">{retryAfter === undefined ? localizeError(locale, text) : t(text)}</p><button type="button" onClick={retry} disabled={cooldown.active}>{t("Повторить")}</button></div>;
}

/** Индикатор загрузки: появляется, только если запрос идёт дольше 300 мс, чтобы не мигать. */
export function Loading({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <p role="status" className="loading-indicator"><span className="spinner" aria-hidden="true" />{label}</p> : null;
}
