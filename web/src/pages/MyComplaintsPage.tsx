import { lastComplaintPath } from '../features/lastComplaint';
import { useLastComplaint } from '../features/lastComplaintStore';
import { useI18n, systemText, localeNames } from '../i18n';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { AnonymousBadge } from '../features/complaintMeta';
import { dateLabel, Loading, LoadError, StatusBadge, typeLabels } from '../features/complaint';

export default function MyComplaintsPage() {
  const { t, locale } = useI18n();
  const { api, role } = useSession();
  const lastId = useLastComplaint(role);
  const [offset, setOffset] = useState(0);
  const load = useCallback(async () => requireData((await api.GET('/complaints', { params: { query: { limit: 20, offset } } })).data), [api, offset]);
  const result = useResource(load);
  return <section className="section"><p className="eyebrow">{t("Личный кабинет")}</p><h1>{t("Мои обращения")}</h1>
    {lastId && <p><Link to={lastComplaintPath(role, lastId)}>{t('Вернуться к последнему обращению')}</Link></p>}
    {result.loading && <Loading label={t("Загрузка обращений…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {result.data && <>
      {result.data.total === 0 ? <div><p>{t("У вас пока нет обращений.")}</p><Link to="/submit">{t("Подать первое обращение")}</Link></div> : <>
        <p className="muted">{t("Всего обращений:")} {new Intl.NumberFormat(localeNames[locale]).format(result.data.total)}</p>
        <ul className="complaint-list">{result.data.items.map(item => <li key={item.id} className="complaint-item">
          <div className="item-header"><Link className="complaint-number" to={`/my/${item.id}`}>{item.number}</Link>{item.anonymous && <AnonymousBadge />}<StatusBadge status={item.status} /></div>
          <p className="item-description">{item.description}</p>
          <p className="muted">{t(typeLabels[item.type])} · {dateLabel(item.createdAt, locale)}</p>
          <p>{systemText(locale, item.nextAction)}</p>
          {item.overdue && <p className="overdue">{t("Просрочено · срок")} {dateLabel(item.dueAt, locale)}</p>}
        </li>)}</ul>
        {result.data.total > 20 && <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>{t("Назад")}</button><span>{t("Страница")} {Math.floor(offset / 20) + 1} {t("из")} {Math.max(1, Math.ceil(result.data.total / 20))}</span><button disabled={offset + result.data.items.length >= result.data.total} onClick={() => setOffset(value => value + 20)}>{t("Далее")}</button></div>}
      </>}
    </>}
  </section>;
}
