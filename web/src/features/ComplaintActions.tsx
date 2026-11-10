import { useCallback, useRef, useState } from 'react';
import { useSession } from '../app/session';
import type { components } from '../api/client';
import { statusTransitions } from '../api/policy';
import { errorMessage, requireData, useResource } from './data';
import { LoadError, statusLabels } from './complaint';
import type { Complaint } from './complaint';

type Outcome = components['schemas']['DecisionInput']['outcome'];
type CommentKind = components['schemas']['CommentInput']['kind'];

function useMutation(onUpdated: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); onUpdated(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, error, setError, run };
}

export function AuthorReply({ item, onUpdated }: { item: Complaint; onUpdated: () => void }) {
  const { api } = useSession();
  const [text, setText] = useState('');
  const mutation = useMutation(onUpdated);
  const question = [...item.comments].reverse().find(comment => comment.kind === 'clarification_request');
  if (item.status !== 'awaiting_clarification') return null;
  return <form className="action-panel" onSubmit={event => {
    event.preventDefault();
    if (!text.trim()) { mutation.setError('Введите ответ на уточнение.'); return; }
    void mutation.run(async () => requireData((await api.POST('/complaints/{complaintId}/comments', { params: { path: { complaintId: item.id } }, body: { kind: 'clarification_response', text: text.trim() } })).data));
  }}><h2>Ответить на уточнение</h2>{question && <blockquote className="preserve-lines">{question.text}</blockquote>}<label htmlFor="author-reply">Ваш ответ на уточнение</label><textarea id="author-reply" rows={3} maxLength={5000} value={text} onChange={event => setText(event.target.value)} />
    {mutation.error && <p role="alert" className="field-error">{mutation.error}</p>}
    <button className="primary-button" disabled={mutation.busy} type="submit">{mutation.busy ? 'Отправка…' : 'Отправить уточнение'}</button>
  </form>;
}

export function ManagerActions({ item, onUpdated }: { item: Complaint; onUpdated: () => void }) {
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

  function postComment(kind: CommentKind) {
    if (!comment.trim()) { mutation.setError('Введите текст сообщения.'); return; }
    void mutation.run(async () => requireData((await api.POST('/complaints/{complaintId}/comments', { params: { path }, body: { kind, text: comment.trim() } })).data));
  }

  return <div className="management-panel"><h2>Обработка обращения</h2>
    {mutation.error && <div className="load-error"><p role="alert">{mutation.error}</p><button type="button" onClick={onUpdated}>Обновить карточку</button></div>}
    <fieldset disabled={mutation.busy}>
      <legend>Назначение</legend>
      {reference.loading && <p role="status">Загрузка ответственных…</p>}
      {reference.error && <LoadError message={reference.error} retry={reference.reload} />}
      {reference.data && <form className="action-panel" onSubmit={event => {
        event.preventDefault();
        if (!assigneeId) { mutation.setError('Выберите ответственного.'); return; }
        void mutation.run(async () => requireData((await api.PATCH('/complaints/{complaintId}/assignment', { params: { path }, body: { assigneeId } })).data));
      }}><label htmlFor="assignee">Назначить ответственного</label><select id="assignee" value={assigneeId} onChange={event => setAssignee(event.target.value)}><option value="">Выберите руководителя</option>{reference.data.assignees.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select><button type="submit">Назначить</button></form>}
    </fieldset>
    <fieldset disabled={mutation.busy}><legend>Статус и обсуждение</legend>
      <div className="actions">{(['in_review', 'in_progress'] as const).filter(status => allowed.includes(status)).map(status => <button key={status} onClick={() => void mutation.run(async () => requireData((await api.PATCH('/complaints/{complaintId}/status', { params: { path }, body: { status } })).data))}>{status === 'in_progress' ? 'Взять в работу' : item.status === 'new' ? 'Начать рассмотрение' : 'Вернуть на рассмотрение'}</button>)}</div>
      <div className="action-panel"><label htmlFor="manager-comment">Комментарий или вопрос</label><textarea id="manager-comment" rows={3} maxLength={5000} value={comment} onChange={event => setComment(event.target.value)} /><div className="actions"><button onClick={() => postComment('comment')}>Добавить комментарий</button>{allowed.includes('awaiting_clarification') && <button onClick={() => postComment('clarification_request')}>Запросить уточнение</button>}</div></div>
    </fieldset>
    {outcomes.length > 0 && <fieldset disabled={mutation.busy}><legend>Завершение</legend><form className="action-panel" onSubmit={event => {
      event.preventDefault();
      if (!explanation.trim()) { mutation.setError('Объясните решение или причину отказа.'); return; }
      void mutation.run(async () => requireData((await api.POST('/complaints/{complaintId}/decision', { params: { path }, body: { outcome, explanation: explanation.trim(), ...(actions.trim() ? { actions: actions.trim() } : {}) } })).data));
    }}><label htmlFor="outcome">Итог рассмотрения</label><select id="outcome" value={outcome} onChange={event => setOutcome(event.target.value as Outcome)}>{outcomes.map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select>
      <label htmlFor="explanation">Обоснование решения</label><textarea id="explanation" rows={4} maxLength={5000} value={explanation} onChange={event => setExplanation(event.target.value)} />
      <label htmlFor="decision-actions">Дальнейшие действия (необязательно)</label><textarea id="decision-actions" rows={2} maxLength={5000} value={actions} onChange={event => setActions(event.target.value)} />
      <button type="submit" className="primary-button">Зафиксировать итог</button>
    </form></fieldset>}
  </div>;
}
