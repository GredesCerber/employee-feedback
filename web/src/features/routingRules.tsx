import { useCallback } from 'react';
import { useI18n, referenceLabel } from '../i18n';
import { useSession } from '../app/session';
import { requireData, useResource } from './data';
import { Link } from 'react-router-dom';

/** Аудит Г5 (docs/research/final-tz-audit.md): администратор видит, куда уходит каждая категория и в какой срок. Только чтение. */
export function RoutingRules() {
  const { t, locale } = useI18n();
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const { data, error, reload } = useResource(load);
  const owner = (id: string | null) => id ? data?.assignees?.find(user => user.id === id)?.name ?? id : null;
  return <section className="summary-table-panel routing-rules" aria-labelledby="routing-rules-title">
    <h2 id="routing-rules-title">{t("Категории и ответственные")}</h2>
    <p className="muted">{t("Обращение автоматически уходит ответственному по категории. Без правила оно попадает в запасную очередь руководителя. Менять правила можно в разделе «Пользователи и права».")}</p>
    <p><Link to="/admin">{t("Открыть раздел «Пользователи и права»")}</Link></p>
    {error && <p role="alert">{error} <button type="button" onClick={reload}>{t("Повторить")}</button></p>}
    {data && Array.isArray(data.categories) && <table aria-label={t("Категории и ответственные")}>
      <thead><tr><th scope="col">{t("Категория")}</th><th scope="col">{t("Ответственный")}</th><th scope="col">{t("Срок ответа, дней")}</th></tr></thead>
      <tbody>{data.categories.map(category => <tr key={category.id}>
        <th scope="row">{referenceLabel(locale, 'category', category.id, category.name)}</th>
        <td>{owner(category.assigneeId) ?? <span className="muted">{t("Запасная очередь руководителя")}</span>}</td>
        <td>{category.dueInDays}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}
