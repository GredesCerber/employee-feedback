import { useI18n, localizeError } from '../i18n';
import { useCallback, useRef, useState } from 'react';
import { useSession } from '../app/session';
import type { components } from '../api/client';
import { statusTransitions } from '../api/policy';
import { errorMessage, requireData, retryAfterOf, useCooldown, useResource } from './data';
import { Loading, LoadError, statusLabels } from './complaint';
import type { Complaint } from './complaint';

type Outcome = components['schemas']['DecisionInput']['outcome'];
type CommentKind = components['schemas']['CommentInput']['kind'];

type OnUpdated = (message?: string) => void;

function useMutation(onUpdated: OnUpdated) {
  const { locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setErrorText] = useState('');
  const [field, setField] = useState('');
  const lock = useRef(false);
  const cooldown = useCooldown();
  /** Ошибка проверки: текст, связанное поле и фокус на нём. */
  function setError(message: string, fieldId = '') {
    setErrorText(message); setField(fieldId);
    if (fieldId) document.getElementById(fieldId)?.focus();
  }
  async function run(action: () => Promise<unknown>, success: string) {
    if (lock.current || cooldown.active) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); onUpdated(success); }
    catch (failure) {
      const wait = retryAfterOf(failure);
      if (wait) cooldown.start(wait);
      setError(wait ? '' : localizeError(locale, errorMessage(failure)));
    }
    finally { lock.current = false; setBusy(false); }
  }
  /** Атрибуты поля, связанные с текущей ошибкой. */
  function invalid(fieldId: string, errorId: string) {
    return field === fieldId && error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {};
  }
  // Пока идёт отсчёт после 429, текст ошибки показывает оставшиеся секунды, а действия заблокированы.
  const shown = cooldown.active ? cooldown.message : error;
  return { busy: busy || cooldown.active, error: shown, setError, run, invalid };
}

export function AuthorReply({ item, onUpdated }: { item: Complaint; onUpdated: OnUpdated }) {
  const { t } = useI18n();
  const { api } = useSession();
  const [text, setText] = useState('');
  const mutation = useMutation(onUpdated);
  const question = [...item.comments].reverse().find(comment => comment.kind === 'clarification_request');
  if (item.status !== 'awaiting_clarification') return null;
  return <form className="action-panel" onSubmit={event => {
    event.preventDefault();
    if (!text.trim()) { mutation.setError("Введите ответ на уточнение.", 'author-reply'); return; }
    void mutation.run(async () => requireData((await api.POST('/complaints/{complaintId}/comments', { params: { path: { complaintId: item.id } }, body: { kind: 'clarification_response', text: text.trim() } })).data), "Ответ на уточнение отправлен.");
  }}><h2>{t("Ответить на уточнение")}</h2>{question && <blockquote className="preserve-lines">{question.text}</blockquote>}<label htmlFor="author-reply">{t("Ваш ответ на уточнение")}</label><textarea id="author-reply" aria-required="true" {...mutation.invalid('author-reply', 'author-reply-error')} rows={3} maxLength={5000} value={text} onChange={event => setText(event.target.value)} />
    {mutation.error && <p id="author-reply-error" role="alert" className="field-error">{t(mutation.error)}</p>}
    <button className="primary-button" disabled={mutation.busy} aria-busy={mutation.busy} type="submit">{mutation.busy ? t("Отправка…") : t("Отправить ответ")}</button>
  </form>;
}

export function ManagerActions({ item, onUpdated }: { item: Complaint; onUpdated: OnUpdated }) {
  const { t } = useI18n();
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(load);
  const [assigneeId, setAssignee] = useState(item.assignee?.id ?? '');
  const [comment, setComment] = useState('');
  const [explanation, setExplanation] = useState('');
  const [actions, setActions] = useState('');
  const allowed: readonly string[] = statusTransitions[item.status];
  const outcomes = (['implemented', 'rejected', 'closed'] as const).filter(value => allowed.includes(value));
  const [outcome, setOutcome] = useState<Outcome>(outcomes[0] ?? 'rejected');
  const mutation = useMutation(onUpdated);
  const path = { complaintId: item.id };
  const terminal = ['implemented', 'rejected', 'closed'].includes(item.status);
  if (terminal) return null;

  /** Шаблон только подставляет текст в поле: человек правит и отправляет сам (идея «черновик ответа», без ИИ и сети). */
  const withTemplate = (current: string, template: string) => current.trim() ? `${current.trimEnd()}\n\n${template}` : template;

  function postComment(kind: CommentKind) {
    if (!comment.trim()) { mutation.setError('Введите текст сообщения.', 'manager-comment'); return; }
    void mutation.run(async () => {
      requireData((await api.POST('/complaints/{complaintId}/comments', { params: { path }, body: { kind, text: comment.trim() } })).data);
      setComment('');
    },
      kind === 'clarification_request' ? 'Запрос уточнения отправлен автору.' : 'Комментарий добавлен.');
  }

  return <div className="management-panel"><h2>{t("Обработка обращения")}</h2>
    {mutation.error && <div className="load-error"><p id="manager-action-error" role="alert">{t(mutation.error)}</p><button type="button" onClick={() => onUpdated()}>{t("Обновить карточку")}</button></div>}
    <fieldset disabled={mutation.busy}>
      <legend>{t("Назначение")}</legend>
      {reference.loading && <Loading label={t("Загрузка ответственных…")} />}
      {reference.error && <LoadError message={reference.error} retry={reference.reload} retryAfter={reference.retryAfter} />}
      {reference.data && <form className="action-panel" onSubmit={event => {
        event.preventDefault();
        if (!assigneeId) { mutation.setError("Выберите ответственного.", 'assignee'); return; }
        void mutation.run(async () => requireData((await api.PATCH('/complaints/{complaintId}/assignment', { params: { path }, body: { assigneeId } })).data), "Ответственный назначен.");
      }}><label htmlFor="assignee">{t("Назначить ответственного")}</label><select id="assignee" aria-required="true" {...mutation.invalid('assignee', 'manager-action-error')} value={assigneeId} onChange={event => setAssignee(event.target.value)}><option value="">{t("Назначить ответственного")}</option>{reference.data.assignees.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select><button type="submit">{t("Назначить")}</button></form>}
    </fieldset>
    <fieldset disabled={mutation.busy}><legend>{t("Статус и обсуждение")}</legend>
      <div className="actions">{(['in_review', 'in_progress'] as const).filter(status => allowed.includes(status)).map(status => <button key={status} onClick={() => void mutation.run(async () => requireData((await api.PATCH('/complaints/{complaintId}/status', { params: { path }, body: { status } })).data), "Статус обращения изменён.")}>{status === 'in_progress' ? t("Взять в работу") : item.status === 'new' ? t("Начать рассмотрение") : t("Вернуть на рассмотрение")}</button>)}</div>
      <div className="action-panel"><label htmlFor="manager-comment">{t("Комментарий или вопрос")}</label><textarea id="manager-comment" {...mutation.invalid('manager-comment', 'manager-action-error')} rows={3} maxLength={5000} value={comment} onChange={event => setComment(event.target.value)} /><div className="actions"><button type="button" className="template-button" onClick={() => setComment(value => withTemplate(value, t("Здравствуйте! Чтобы рассмотреть обращение, уточните, пожалуйста: 1) в каком подразделении и на каком этапе возникла ситуация; 2) как часто это повторяется; 3) какой результат вы ожидаете.")))}>{t("Вставить шаблон вопроса")}</button><button onClick={() => postComment('comment')}>{t("Добавить комментарий")}</button>{allowed.includes('awaiting_clarification') && <button onClick={() => postComment('clarification_request')}>{t("Запросить уточнение")}</button>}</div></div>
    </fieldset>
    {outcomes.length > 0 && <fieldset disabled={mutation.busy}><legend>{t("Завершение")}</legend><form className="action-panel" onSubmit={event => {
      event.preventDefault();
      if (!explanation.trim()) { mutation.setError("Объясните решение или причину отказа.", 'explanation'); return; }
      void mutation.run(async () => requireData((await api.POST('/complaints/{complaintId}/decision', { params: { path }, body: { outcome, explanation: explanation.trim(), ...(actions.trim() ? { actions: actions.trim() } : {}) } })).data), "Итог рассмотрения зафиксирован.");
    }}><label htmlFor="outcome">{t("Итог рассмотрения")}</label><select id="outcome" value={outcome} onChange={event => setOutcome(event.target.value as Outcome)}>{outcomes.map(value => <option key={value} value={value}>{t(statusLabels[value])}</option>)}</select>
      {item.status === 'new' && outcomes.length === 1 && <p className="muted">{t("Сейчас доступен только отказ: чтобы выбрать другой итог, сначала начните рассмотрение.")}</p>}
      <label htmlFor="explanation">{outcome === 'rejected' ? t("Мотивированный отказ") : t("Обоснование решения")}</label><textarea id="explanation" aria-required="true" {...mutation.invalid('explanation', 'manager-action-error')} rows={4} maxLength={5000} value={explanation} onChange={event => setExplanation(event.target.value)} /><div className="actions"><button type="button" className="template-button" onClick={() => setExplanation(value => withTemplate(value, outcome === 'rejected'
        ? t("Спасибо за обращение. Мы внимательно его рассмотрели, но не можем реализовать это предложение сейчас. Причина: [укажите причину]. Если ситуация изменится, мы вернёмся к вопросу.")
        : t("Спасибо за обращение. Мы приняли решение: [что именно сделано или будет сделано]. Срок: [укажите срок].")))}>{t("Вставить шаблон решения")}</button></div>
      <label htmlFor="decision-actions">{t("Дальнейшие действия (необязательно)")}</label><textarea id="decision-actions" rows={2} maxLength={5000} value={actions} onChange={event => setActions(event.target.value)} />
      <button type="submit" className="primary-button">{t("Зафиксировать итог")}</button>
    </form></fieldset>}
  </div>;
}
