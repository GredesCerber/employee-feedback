import { useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from '../i18n';
import { useSession } from '../app/session';
import { errorMessage, requireData, retryAfterOf, useCooldown } from './data';
import { dateLabel } from './complaint';
import type { Complaint } from './complaint';
import './engagement.css';

const finished = ['implemented', 'rejected', 'closed'];

/** Подтверждение результата: после итога автор отвечает «Понятен ли ответ?» и «Решена ли проблема?». Остальные роли видят оценку. */
export function ResultFeedback({ item, onUpdated }: { item: Complaint; onUpdated: (message?: string) => void }) {
  const { t, locale } = useI18n();
  const { api, role } = useSession();
  const [understood, setUnderstood] = useState<boolean | null>(null);
  const [solved, setSolved] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cooldown = useCooldown();
  if (!finished.includes(item.status)) return null;
  const yesNo = (value: boolean) => value ? t("Да") : t("Нет");

  if (item.feedback) return <section className="result-feedback" aria-labelledby="result-feedback-title">
    <h2 id="result-feedback-title">{t("Оценка результата автором")}</h2>
    <dl className="result-feedback-answers">
      <div><dt>{t("Понятен ли ответ?")}</dt><dd>{yesNo(item.feedback.understood)}</dd></div>
      <div><dt>{t("Решена ли проблема?")}</dt><dd>{yesNo(item.feedback.solved)}</dd></div>
      {item.feedback.comment && <div><dt>{t("Комментарий")}</dt><dd className="preserve-lines">{item.feedback.comment}</dd></div>}
    </dl>
    <p className="muted">{dateLabel(item.feedback.createdAt, locale)}</p>
  </section>;
  if (role !== 'employee') return <section className="result-feedback"><h2>{t("Оценка результата автором")}</h2><p className="muted">{t("Автор ещё не оценил результат.")}</p></section>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (understood === null || solved === null) { setError(t("Ответьте на оба вопроса.")); return; }
    if (busy || cooldown.active) return;
    setBusy(true); setError('');
    try {
      requireData((await api.POST('/complaints/{complaintId}/feedback', { params: { path: { complaintId: item.id } },
        body: { understood, solved, ...(comment.trim() ? { comment: comment.trim() } : {}) } })).data);
      onUpdated(t("Спасибо! Ваша оценка сохранена."));
    } catch (failure) {
      const wait = retryAfterOf(failure);
      if (wait) cooldown.start(wait); else setError(errorMessage(failure));
    } finally { setBusy(false); }
  }
  const choice = (name: string, value: boolean | null, set: (next: boolean) => void) => <div className="result-feedback-choice" role="radiogroup" aria-labelledby={`${name}-label`}>
    {[true, false].map(option => <label key={String(option)} className="checkbox-label"><input type="radio" name={name} checked={value === option} onChange={() => set(option)} />{yesNo(option)}</label>)}
  </div>;
  return <form className="result-feedback action-panel" onSubmit={submit} aria-labelledby="result-feedback-title" noValidate>
    <h2 id="result-feedback-title">{t("Оцените результат")}</h2>
    <p className="muted">{t("Два коротких вопроса помогают понять, что система действительно работает.")}</p>
    <p id="feedback-understood-label"><strong>{t("Понятен ли ответ?")}</strong></p>
    {choice('feedback-understood', understood, setUnderstood)}
    <p id="feedback-solved-label"><strong>{t("Решена ли проблема?")}</strong></p>
    {choice('feedback-solved', solved, setSolved)}
    <label htmlFor="feedback-comment">{t("Комментарий (необязательно)")}</label>
    <textarea id="feedback-comment" rows={2} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} />
    {(cooldown.active || error) && <p role="alert" className="field-error">{cooldown.active ? cooldown.message : error}</p>}
    <button className="primary-button" type="submit" disabled={busy || cooldown.active} aria-busy={busy}>{busy ? t("Отправка…") : t("Отправить оценку")}</button>
  </form>;
}

/** Автор видит, что его обращение объединено с другими, и план работы по общей проблеме. */
export function ProblemBanner({ item }: { item: Complaint }) {
  const { t } = useI18n();
  if (!item.problem) return null;
  return <section className="problem-banner" aria-labelledby="problem-banner-title">
    <h2 id="problem-banner-title">{t("Общая проблема")}</h2>
    <p><strong>{item.problem.title}</strong></p>
    <p className="muted">{t("Обращение объединено с похожими: их разберут вместе, итог будет общим.")}</p>
    {item.problem.plan && <><h3>{t("План действий")}</h3><p className="preserve-lines">{item.problem.plan}</p></>}
  </section>;
}
