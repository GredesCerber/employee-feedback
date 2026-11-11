import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, StatusBadge, typeLabels } from '../features/complaint';
import { AuthorReply, ManagerActions } from '../features/ComplaintActions';
import { ImitationBadge } from '../features/demo';
import { authorLabel, CommentKindBadge, fallbackQueueHint, priorityLabels, referenceName, routingReasonLabels } from '../features/complaintMeta';
import './complaint.css';

export default function ComplaintPage() {
  const { complaintId = '' } = useParams();
  const { api, role } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const load = useCallback(async () => requireData((await api.GET('/complaints/{complaintId}', { params: { path: { complaintId } } })).data), [api, complaintId]);
  const result = useResource(load);
  const item = result.data;
  // Справочник нужен, чтобы показать названия категории и подразделения вместо id.
  const loadReference = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(loadReference);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const focusPending = useRef(false);
  const { reload } = result;
  // Подсказка демо: карточка автора — шаг 2 (нового обращения без итога) или шаг 4 (есть решение).
  const demoStep = item ? (item.decision ? 4 : 2) : undefined;
  const currentStep = (location.state as { demoStep?: number } | null)?.demoStep;
  useEffect(() => {
    if (role !== 'employee' || demoStep === undefined || currentStep === demoStep) return;
    navigate(location, { replace: true, state: { ...(location.state as object | null), demoStep } });
  }, [role, demoStep, currentStep, location, navigate]);
  const onUpdated = useCallback((message?: string) => {
    if (message) { setNotice(message); focusPending.current = true; }
    reload();
  }, [reload]);
  useEffect(() => {
    if (item && focusPending.current) { focusPending.current = false; heading.current?.focus(); }
  }, [item]);
  return <section className="section"><Link to={role === 'manager' ? '/queue' : '/my'}>{role === 'manager' ? 'К очереди' : 'К моим обращениям'}</Link>
    <p className="visually-hidden" aria-live="polite">{notice}</p>
    {result.loading && <><h1>Обращение</h1><Loading label="Загрузка обращения…" /></>}
    {result.error && <><h1>Обращение недоступно</h1><LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} /></>}
    {item && <>
      <div className="detail-header"><h1 ref={heading} tabIndex={-1}>Обращение {item.number}</h1><StatusBadge status={item.status} /></div>
      <div className="next-action"><h2>Следующий шаг</h2><p>{item.nextAction}</p></div>
      {role === 'employee' && <AuthorReply item={item} onUpdated={onUpdated} />}
      <dl className="metadata"><div><dt>Тип</dt><dd>{typeLabels[item.type]}</dd></div>
        <div><dt>Категория</dt><dd>{referenceName(reference.data?.categories, item.categoryId, reference.loading)}</dd></div>
        <div><dt>Подразделение</dt><dd>{referenceName(reference.data?.departments, item.departmentId, reference.loading)}</dd></div>
        <div><dt>Приоритет</dt><dd>{priorityLabels[item.priority]}</dd></div>
        <div><dt>Автор</dt><dd>{authorLabel(item)}</dd></div>
        <div><dt>Ответственный</dt><dd>{item.assignee?.name ?? 'Ожидает назначения'}</dd></div>
        <div><dt>Как назначен</dt><dd>{routingReasonLabels[item.routing.reason]}</dd></div><div><dt>Создано</dt><dd>{dateLabel(item.createdAt)}</dd></div><div><dt>Срок</dt><dd className={item.overdue ? 'overdue' : ''}>{item.overdue ? 'Просрочено · ' : ''}{dateLabel(item.dueAt)}</dd></div></dl>
      {!item.assignee && <p className="fallback-queue-hint">{fallbackQueueHint}</p>}
      <h2>Описание</h2><p className="preserve-lines">{item.description}</p>
      {item.proposedSolution && <><h2>Предлагаемое решение</h2><p className="preserve-lines">{item.proposedSolution}</p></>}
      {item.attachments.length > 0 && <><h2>Тестовые вложения <ImitationBadge hint="не настоящий файл: содержимое не загружается" /></h2><p className="muted">Сохранены только сведения о файлах-заглушках, содержимое недоступно.</p><ul>{item.attachments.map((file, index) => <li key={`${file.name}-${index}`}>{file.name} · {file.sizeBytes} байт</li>)}</ul></>}
      {item.decision && <div className="decision"><h2>Итог рассмотрения</h2><StatusBadge status={item.decision.outcome} /><p className="preserve-lines">{item.decision.explanation}</p>{item.decision.actions && <><h3>Дальнейшие действия</h3><p className="preserve-lines">{item.decision.actions}</p></>}<p className="muted">{item.decision.author.name} · {dateLabel(item.decision.createdAt)}</p></div>}
      <h2>Комментарии</h2>{item.comments.length === 0 ? <p className="muted">Комментариев пока нет.</p> : <ul className="timeline">{item.comments.map(comment => <li key={comment.id} className={`comment comment-${comment.kind}`}><CommentKindBadge kind={comment.kind} /> <strong>{comment.author.name}</strong><p className="preserve-lines">{comment.text}</p><time dateTime={comment.createdAt}>{dateLabel(comment.createdAt)}</time></li>)}</ul>}
      <h2>История обращения</h2><ol className="timeline">{item.history.map(event => <li key={event.id}><p className="preserve-lines">{event.text}</p><p className="muted">{event.actor?.name ?? 'Система'} · <time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time></p></li>)}</ol>
      {role === 'manager' && <ManagerActions key={`${item.id}-${item.status}`} item={item} onUpdated={onUpdated} />}
    </>}
  </section>;
}
