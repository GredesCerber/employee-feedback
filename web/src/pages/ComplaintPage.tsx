import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, LoadError, StatusBadge, typeLabels } from '../features/complaint';
import { AuthorReply, ManagerActions } from '../features/ComplaintActions';

export default function ComplaintPage() {
  const { complaintId = '' } = useParams();
  const { api, role } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/complaints/{complaintId}', { params: { path: { complaintId } } })).data), [api, complaintId]);
  const result = useResource(load);
  const item = result.data;
  return <section className="section"><Link to={role === 'manager' ? '/queue' : '/my'}>{role === 'manager' ? 'К очереди' : 'К моим обращениям'}</Link>
    {result.loading && <><h1>Обращение</h1><p role="status">Загрузка обращения…</p></>}
    {result.error && <><h1>Обращение недоступно</h1><LoadError message={result.error} retry={result.reload} /></>}
    {item && <>
      <div className="detail-header"><h1>Обращение {item.number}</h1><StatusBadge status={item.status} /></div>
      <div className="next-action"><h2>Следующий шаг</h2><p>{item.nextAction}</p></div>
      {role === 'employee' && <AuthorReply item={item} onUpdated={result.reload} />}
      <dl className="metadata"><div><dt>Тип</dt><dd>{typeLabels[item.type]}</dd></div><div><dt>Ответственный</dt><dd>{item.assignee?.name ?? 'Ожидает назначения'}</dd></div><div><dt>Создано</dt><dd>{dateLabel(item.createdAt)}</dd></div><div><dt>Срок</dt><dd className={item.overdue ? 'overdue' : ''}>{item.overdue ? 'Просрочено · ' : ''}{dateLabel(item.dueAt)}</dd></div></dl>
      <h2>Описание</h2><p className="preserve-lines">{item.description}</p>
      {item.proposedSolution && <><h2>Предлагаемое решение</h2><p className="preserve-lines">{item.proposedSolution}</p></>}
      {item.attachments.length > 0 && <><h2>Тестовые вложения</h2><p className="muted">Сохранены только сведения о файлах-заглушках, содержимое недоступно.</p><ul>{item.attachments.map((file, index) => <li key={`${file.name}-${index}`}>{file.name} · {file.sizeBytes} байт</li>)}</ul></>}
      {item.decision && <div className="decision"><h2>Итог рассмотрения</h2><StatusBadge status={item.decision.outcome} /><p className="preserve-lines">{item.decision.explanation}</p>{item.decision.actions && <><h3>Дальнейшие действия</h3><p className="preserve-lines">{item.decision.actions}</p></>}<p className="muted">{item.decision.author.name} · {dateLabel(item.decision.createdAt)}</p></div>}
      <h2>Комментарии</h2>{item.comments.length === 0 ? <p className="muted">Комментариев пока нет.</p> : <ul className="timeline">{item.comments.map(comment => <li key={comment.id}><strong>{comment.author.name}</strong><p className="preserve-lines">{comment.text}</p><time dateTime={comment.createdAt}>{dateLabel(comment.createdAt)}</time></li>)}</ul>}
      <h2>История обращения</h2><ol className="timeline">{item.history.map(event => <li key={event.id}><p className="preserve-lines">{event.text}</p><p className="muted">{event.actor?.name ?? 'Система'} · <time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time></p></li>)}</ol>
      {role === 'manager' && <ManagerActions key={`${item.id}-${item.status}`} item={item} onUpdated={result.reload} />}
    </>}
  </section>;
}
