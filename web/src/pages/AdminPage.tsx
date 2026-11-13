import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n, referenceLabel } from '../i18n';
import { useSession } from '../app/session';
import type { Role } from '../app/session';
import { errorMessage, requireData, useResource } from '../features/data';
import { Loading, LoadError } from '../features/complaint';
import './admin.css';

const roles: Role[] = ['employee', 'manager', 'admin'];
const roleTitle: Record<Role, string> = { employee: 'Сотрудник', manager: 'Руководитель', admin: 'Администратор' };

/** Раздел администратора: пользователи, роли, активность и маршрутизация категорий. Данные демо хранятся в памяти сервера. */
export default function AdminPage() {
  const { t, locale } = useI18n();
  const { api, userId } = useSession();
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', departmentId: '', role: 'employee' as Role, password: '' });
  const load = useCallback(async () => {
    const [users, reference, audit] = await Promise.all([api.GET('/admin/users'), api.GET('/reference-data'), api.GET('/admin/audit', { params: { query: { limit: 100 } } })]);
    return { users: requireData(users.data).items, reference: requireData(reference.data), audit: requireData(audit.data).items, version };
  }, [api, version]);
  const { data, error: loadError, loading, reload } = useResource(load);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null); setNotice(null);
    try { await action(); setNotice(done); setVersion(value => value + 1); }
    catch (failure) { setError(errorMessage(failure)); }
  }
  const departments = data?.reference.departments ?? [];
  const departmentName = (id: string) => referenceLabel(locale, 'department', id, departments.find(item => item.id === id)?.name ?? id);
  const managers = data?.users.filter(user => user.role === 'manager' && user.active) ?? [];

  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api.POST('/admin/users', { body: { name: form.name.trim(), role: form.role, departmentId: form.departmentId || departments[0]?.id || '', ...(form.password ? { password: form.password } : {}) } });
      setForm({ name: '', departmentId: form.departmentId, role: 'employee', password: '' });
    }, 'Участник добавлен: он появился на экране входа.');
  }

  return <section className="section admin-page" aria-labelledby="admin-title">
    <h1 id="admin-title">{t('Пользователи и права')}</h1>
    <p className="muted">{t('Добавляйте участников, меняйте роли и права, деактивируйте учётки и настраивайте, кому уходят обращения. Новые участники сразу появляются на экране входа. Данные демо хранятся в памяти сервера и возвращаются к исходным при сбросе демо.')}</p>
    <div className="admin-messages" aria-live="polite">
      {notice && <p className="admin-notice" role="status">{t(notice)}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>

    <form className="summary-table-panel admin-form" onSubmit={create} aria-labelledby="admin-add-title">
      <h2 id="admin-add-title">{t('Добавить участника')}</h2>
      <div className="admin-form-grid">
        <label>{t('ФИО')}<input value={form.name} maxLength={200} required onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>{t('Подразделение')}<select value={form.departmentId || departments[0]?.id || ''} onChange={event => setForm({ ...form, departmentId: event.target.value })}>
          {departments.map(item => <option key={item.id} value={item.id}>{departmentName(item.id)}</option>)}</select></label>
        <label>{t('Роль')}<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as Role })}>
          {roles.map(role => <option key={role} value={role}>{t(roleTitle[role])}</option>)}</select></label>
        <label>{t('Пароль (не меньше 8 знаков)')}<input type="password" autoComplete="new-password" value={form.password} minLength={8} maxLength={100}
          onChange={event => setForm({ ...form, password: event.target.value })} /></label>
        <button type="submit" disabled={!form.name.trim() || departments.length === 0 || (form.password.length > 0 && form.password.length < 8)}>{t('Добавить')}</button>
      </div>
    </form>

    {loading && !data && <Loading label={t('Загрузка пользователей')} />}
    {loadError && <LoadError message={loadError} retry={reload} />}
    {data && <>
      <section className="summary-table-panel" aria-labelledby="admin-users-title">
        <h2 id="admin-users-title">{t('Пользователи')} ({data.users.length})</h2>
        <div className="admin-table-wrap"><table aria-label={t('Пользователи')}>
          <thead><tr><th scope="col">{t('ФИО')}</th><th scope="col">{t('Подразделение')}</th><th scope="col">{t('Роль')}</th><th scope="col">{t('Статус')}</th><th scope="col">{t('Действие')}</th></tr></thead>
          <tbody>{data.users.map(user => <tr key={user.id} className={user.active ? undefined : 'admin-inactive'}>
            <th scope="row">{user.name}{user.id === userId && <small className="muted"> · {t('это вы')}</small>}</th>
            <td>{departmentName(user.departmentId)}</td>
            <td><select aria-label={`${t('Роль')}: ${user.name}`} value={user.role} disabled={user.id === userId}
              onChange={event => void run(async () => { await api.PATCH('/admin/users/{userId}', { params: { path: { userId: user.id } }, body: { role: event.target.value as Role } }); }, 'Роль изменена.')}>
              {roles.map(role => <option key={role} value={role}>{t(roleTitle[role])}</option>)}</select></td>
            <td>{user.active ? t('Активен') : t('Деактивирован')}</td>
            <td><button type="button" disabled={user.id === userId}
              onClick={() => void run(async () => { await api.PATCH('/admin/users/{userId}', { params: { path: { userId: user.id } }, body: { active: !user.active } }); }, user.active ? 'Пользователь деактивирован.' : 'Пользователь снова активен.')}>
              {user.active ? t('Деактивировать') : t('Активировать')}</button></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="summary-table-panel" aria-labelledby="admin-routing-title">
        <h2 id="admin-routing-title">{t('Категории и ответственные')}</h2>
        <p className="muted">{t('Новое обращение уходит ответственному по категории в указанный срок. Без ответственного оно попадает в запасную очередь руководителя. Изменения действуют для обращений, поданных после сохранения.')}</p>
        <div className="admin-table-wrap"><table aria-label={t('Редактирование маршрутов категорий')}>
          <thead><tr><th scope="col">{t('Категория')}</th><th scope="col">{t('Ответственный')}</th><th scope="col">{t('Срок ответа, дней')}</th></tr></thead>
          <tbody>{data.reference.categories.map(category => <tr key={`${category.id}-${category.assigneeId}-${category.dueInDays}-${version}`}>
            <th scope="row">{referenceLabel(locale, 'category', category.id, category.name)}</th>
            <td><select aria-label={`${t('Ответственный')}: ${category.name}`} defaultValue={category.assigneeId ?? ''}
              onChange={event => void run(async () => { await api.PATCH('/admin/categories/{categoryId}', { params: { path: { categoryId: category.id } }, body: { assigneeId: event.target.value || null } }); }, 'Правило сохранено.')}>
              <option value="">{t('Запасная очередь руководителя')}</option>
              {managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></td>
            <td><input type="number" min={1} max={90} aria-label={`${t('Срок ответа, дней')}: ${category.name}`} defaultValue={category.dueInDays} className="admin-days"
              onBlur={event => { const days = Number(event.target.value); if (Number.isInteger(days) && days >= 1 && days <= 90 && days !== category.dueInDays) void run(async () => { await api.PATCH('/admin/categories/{categoryId}', { params: { path: { categoryId: category.id } }, body: { dueInDays: days } }); }, 'Правило сохранено.'); }} /></td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <section className="summary-table-panel" aria-labelledby="admin-structure-title">
        <h2 id="admin-structure-title">{t('Структура')}</h2>
        <p className="muted">{t('Подразделения и люди в них. Состав меняется в таблице «Пользователи» выше.')}</p>
        <div className="admin-structure">{departments.map(department => {
          const people = data.users.filter(user => user.departmentId === department.id);
          return <details key={department.id} open={people.length > 0}>
            <summary>{departmentName(department.id)} ({people.length})</summary>
            <ul>{people.map(user => <li key={user.id} className={user.active ? undefined : 'admin-inactive'}>
              {user.name} <small className="muted">· {t(roleTitle[user.role as Role])}{user.active ? '' : ` · ${t('Деактивирован')}`}</small></li>)}
              {people.length === 0 && <li className="muted">{t('Пока никого')}</li>}</ul>
          </details>;
        })}</div>
      </section>

      <section className="summary-table-panel" aria-labelledby="admin-audit-title">
        <h2 id="admin-audit-title">{t('Журнал действий')}</h2>
        <p className="muted">{t('Кто и когда входил, выходил, создавал, назначал и отвечал. Хранится в базе.')}</p>
        <div className="admin-table-wrap"><table aria-label={t('Журнал действий')}>
          <thead><tr><th scope="col">{t('Время')}</th><th scope="col">{t('Кто')}</th><th scope="col">{t('Действие')}</th><th scope="col">{t('Объект')}</th></tr></thead>
          <tbody>{data.audit.map(entry => <tr key={entry.id}>
            <td>{new Date(entry.at).toLocaleString(locale)}</td><td>{entry.actorName ?? '—'}</td><td>{entry.action}</td><td>{entry.target ?? ''}</td>
          </tr>)}
          {data.audit.length === 0 && <tr><td colSpan={4} className="muted">{t('Записей пока нет')}</td></tr>}</tbody>
        </table></div>
      </section>
    </>}
  </section>;
}
