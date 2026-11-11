import { referenceLabel, systemText, useI18n } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { forgetLastComplaint } from '../features/lastComplaint';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, StatusBadge, typeLabels } from '../features/complaint';
import { AuthorReply, ManagerActions } from '../features/ComplaintActions';
import { UndoAction } from '../features/UndoAction';
import { ImitationBadge } from '../features/demo';
import { MapPicker } from '../features/MapPicker';
import { TranslatableText } from '../features/TranslatableText';
import { useRememberComplaint } from '../features/lastComplaintStore';
import { AnonymousBadge, authorLabel, CommentKindBadge, fallbackQueueHint, priorityLabels, referenceName, routingReasonLabels } from '../features/complaintMeta';
import './complaint.css';

export default function ComplaintPage() {
  const { t, locale } = useI18n();
  const { complaintId = '' } = useParams();
  const { api, role } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const load = useCallback(async () => {
    try { return requireData((await api.GET('/complaints/{complaintId}', { params: { path: { complaintId } } })).data); }
    catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) forgetLastComplaint(role, complaintId);
      throw error;
    }
  }, [api, complaintId, role]);
  const result = useResource(load);
  const item = result.data;
  useRememberComplaint(item?.id === complaintId ? item.id : undefined);
  const [mapOpen, setMapOpen] = useState(false);
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
  return <section className="section"><Link to={role === 'manager' ? '/queue' : '/my'}>{role === 'manager' ? t("К очереди") : t("К моим обращениям")}</Link>
    <p className={notice ? 'muted' : 'visually-hidden'} aria-live="polite">{t(notice)}</p>
    {result.loading && <><h1>{t("Обращение")}</h1><Loading label={t("Загрузка обращения…")} /></>}
    {result.error && <><h1>{t("Обращение недоступно")}</h1><LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} /></>}
    {item && <>
      <div className="detail-header"><h1 ref={heading} tabIndex={-1}>{t("Обращение")} {item.number}</h1>{item.simulated && <ImitationBadge hint={t("создано демо-симулятором")} />}{item.anonymous && <AnonymousBadge />}<StatusBadge status={item.status} /></div>
      <div className="next-action"><h2>{t("Следующий шаг")}</h2><p>{systemText(locale, item.nextAction)}</p></div>
      <UndoAction item={item} onUpdated={onUpdated} />
      {role === 'employee' && <AuthorReply item={item} onUpdated={onUpdated} />}
      <dl className="metadata"><div><dt>{t("Тип")}</dt><dd>{t(typeLabels[item.type])}</dd></div>
        <div><dt>{t("Категория")}</dt><dd>{referenceLabel(locale, 'category', item.categoryId, referenceName(reference.data?.categories, item.categoryId, reference.loading))}</dd></div>
        <div><dt>{t("Подразделение")}</dt><dd>{referenceLabel(locale, 'department', item.departmentId, referenceName(reference.data?.departments, item.departmentId, reference.loading))}</dd></div>
        <div><dt>{t("Приоритет")}</dt><dd>{t(priorityLabels[item.priority])}</dd></div>
        <div><dt>{t("Автор")}</dt><dd>{authorLabel(item, locale)}</dd></div>
        <div><dt>{t("Ответственный")}</dt><dd>{item.assignee?.name ?? t("Ожидает назначения")}</dd></div>
        <div><dt>{t("Как назначен")}</dt><dd>{t(routingReasonLabels[item.routing.reason])}</dd></div><div><dt>{t("Создано")}</dt><dd>{dateLabel(item.createdAt, locale)}</dd></div><div><dt>{t("Срок")}</dt><dd className={item.overdue ? 'overdue' : ''}>{item.overdue ? t("Просрочено · ") : ''}{dateLabel(item.dueAt, locale)}</dd></div></dl>
      {!item.assignee && <p className="fallback-queue-hint">{t(fallbackQueueHint)}</p>}
      <h2>{t("Описание")}</h2><TranslatableText complaintId={item.id} field="description" text={item.description} />
      {item.location && <details className="optional-map" open={mapOpen} onToggle={event => setMapOpen(event.currentTarget.open)}>
        <summary>{locale === 'en' ? 'Location on the map' : locale === 'kk' ? 'Картадағы орын' : 'Место на карте'} · {item.location.latitude}, {item.location.longitude}</summary>
        {mapOpen && <MapPicker value={item.location} readOnly />}
      </details>}
      {item.proposedSolution && <><h2>{t("Предлагаемое решение")}</h2><TranslatableText complaintId={item.id} field="proposedSolution" text={item.proposedSolution} /></>}
      {item.attachments.length > 0 && <><h2>{t("Тестовые вложения")} <ImitationBadge hint={t("не настоящий файл: содержимое не загружается")} /></h2><p className="muted">{t("Сохранены только сведения о файлах-заглушках, содержимое недоступно.")}</p><ul>{item.attachments.map((file, index) => <li key={`${file.name}-${index}`}>{file.name} · {file.sizeBytes} {t("байт")}</li>)}</ul></>}
      {item.decision && <div className="decision"><h2>{t("Итог рассмотрения")}</h2><StatusBadge status={item.decision.outcome} /><TranslatableText complaintId={item.id} field="decision" text={item.decision.explanation} />{item.decision.actions && <><h3>{t("Дальнейшие действия")}</h3><TranslatableText complaintId={item.id} field="actions" text={item.decision.actions} /></>}<p className="muted">{item.decision.author.name} · {dateLabel(item.decision.createdAt, locale)}</p></div>}
      <h2>{t("Комментарии")}</h2>{item.comments.length === 0 ? <p className="muted">{t("Комментариев пока нет.")}</p> : <ul className="timeline">{item.comments.map(comment => <li key={comment.id} className={`comment comment-${comment.kind}`}><CommentKindBadge kind={comment.kind} /> <strong>{'id' in comment.author ? comment.author.name : t(comment.author.name)}</strong><TranslatableText complaintId={item.id} field="comment" commentId={comment.id} text={comment.text} /><time dateTime={comment.createdAt}>{dateLabel(comment.createdAt, locale)}</time></li>)}</ul>}
      <h2>{t("История обращения")}</h2><ol className="timeline">{item.history.map(event => <li key={event.id}><p className="preserve-lines">{systemText(locale, event.text)}{event.simulated && <> <ImitationBadge hint={t("создано демо-симулятором")} /></>}</p><p className="muted">{event.actor ? ('id' in event.actor ? event.actor.name : t(event.actor.name)) : t("Система")} · <time dateTime={event.createdAt}>{dateLabel(event.createdAt, locale)}</time></p></li>)}</ol>
      {role === 'manager' && <ManagerActions key={`${item.id}-${item.status}`} item={item} onUpdated={onUpdated} />}
    </>}
  </section>;
}
