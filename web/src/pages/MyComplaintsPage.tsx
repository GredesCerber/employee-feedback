import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { requireData, useResource } from '../features/data';
import { dateLabel, Loading, LoadError, StatusBadge, typeLabels } from '../features/complaint';

export default function MyComplaintsPage() {
  const { api } = useSession();
  const [offset, setOffset] = useState(0);
  const load = useCallback(async () => requireData((await api.GET('/complaints', { params: { query: { limit: 20, offset } } })).data), [api, offset]);
  const result = useResource(load);
  return <section className="section"><p className="eyebrow">Личный кабинет</p><h1>Мои обращения</h1>
    {result.loading && <Loading label="Загрузка обращений…" />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {result.data && <>
      {result.data.total === 0 ? <div><p>У вас пока нет обращений.</p><Link to="/submit">Подать первое обращение</Link></div> : <>
        <p className="muted">Всего обращений: {result.data.total}</p>
        <ul className="complaint-list">{result.data.items.map(item => <li key={item.id} className="complaint-item">
          <div className="item-header"><Link className="complaint-number" to={`/my/${item.id}`}>{item.number}</Link><StatusBadge status={item.status} /></div>
          <p className="item-description">{item.description}</p>
          <p className="muted">{typeLabels[item.type]} · {dateLabel(item.createdAt)}</p>
          <p>{item.nextAction}</p>
          {item.overdue && <p className="overdue">Просрочено · срок {dateLabel(item.dueAt)}</p>}
        </li>)}</ul>
        {result.data.total > 20 && <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>Назад</button><span>Страница {Math.floor(offset / 20) + 1} из {Math.max(1, Math.ceil(result.data.total / 20))}</span><button disabled={offset + result.data.items.length >= result.data.total} onClick={() => setOffset(value => value + 20)}>Далее</button></div>}
      </>}
    </>}
  </section>;
}
