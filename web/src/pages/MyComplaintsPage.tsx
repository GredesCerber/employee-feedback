import { lastComplaintPath } from '../features/lastComplaint';
import { useLastComplaint } from '../features/lastComplaintStore';
import { useI18n, systemText, localeNames } from '../i18n';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { AnonymousBadge } from '../features/complaintMeta';
import { dateLabel, Loading, LoadError, StatusBadge, typeLabels } from '../features/complaint';
import { PageCompletionSignal } from '../features/CompletionSignal';
import { useRevealOnView } from '../features/designMotion';
import '../styles/feedback-layout.css';

export default function MyComplaintsPage() {
  const reveal = useRevealOnView<HTMLLIElement>();
  const { t, locale } = useI18n();
  const { api, role } = useSession();
  const lastId = useLastComplaint(role);
  const [offset, setOffset] = useState(0);
  const load = useCallback(async () => requireData((await api.GET('/complaints', { params: { query: { limit: 20, offset } } })).data), [api, offset]);
  const result = useResource(load);
  return <section className="section my-complaints-page">
    <div className="feedback-heading">
      <div><p className="eyebrow">{t("Личный кабинет")}</p><h1>{t("Мои обращения")}</h1></div>
      {result.data && result.data.total > 0 && <Link className="primary-link" to="/submit">{t("Подать обращение")}</Link>}
    </div>
    {lastId && <p className="feedback-return"><Link to={lastComplaintPath(role, lastId)}>{t("Вернуться к последнему обращению")}</Link></p>}
    {result.loading && <Loading label={t("Загрузка обращений…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {result.data && <>
      {result.data.total === 0 ? <div className="empty-state"><p>{t("У вас пока нет обращений.")}</p><div className="actions"><Link className="primary-link" to="/submit">{t("Подать первое обращение")}</Link></div></div> : <>
        <p className="muted">{t("Всего обращений:")} {new Intl.NumberFormat(localeNames[locale]).format(result.data.total)}</p>
        <PageCompletionSignal items={result.data.items} />
        <ul className="complaint-list">{result.data.items.map(item => <li key={item.id} ref={reveal} className="complaint-item reveal-panel">
          <div className="item-header"><Link className="complaint-number" to={`/my/${item.id}`}>{item.number}</Link>{item.anonymous && <AnonymousBadge />}<StatusBadge status={item.status} /></div>
          <p className="item-description">{item.description}</p>
          <p className="muted">{t(typeLabels[item.type])} · {dateLabel(item.createdAt, locale)}</p>
          <dl className="my-next-action">
            <div><dt>{t("Следующий шаг")}</dt><dd className={item.status === 'awaiting_clarification' ? 'answer-needed' : undefined}>{systemText(locale, item.nextAction)}</dd></div>
            <div><dt>{t("Срок")}</dt><dd className={item.overdue ? 'overdue' : undefined}>{item.overdue && t("Просрочено · срок ")}{dateLabel(item.dueAt, locale)}</dd></div>
          </dl>
        </li>)}</ul>
        {result.data.total > 20 && <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>{t("Назад")}</button><span>{t("Страница")} {Math.floor(offset / 20) + 1} {t("из")} {Math.max(1, Math.ceil(result.data.total / 20))}</span><button disabled={offset + result.data.items.length >= result.data.total} onClick={() => setOffset(value => value + 20)}>{t("Далее")}</button></div>}
      </>}
    </>}
  </section>;
}
