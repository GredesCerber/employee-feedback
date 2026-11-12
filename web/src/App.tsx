import { I18nProvider, useI18n } from './i18n';
import LanguageSelect from './i18n/LanguageSelect';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { SessionProvider, demoAccounts, useSession } from './app/session';
import type { Role } from './app/session';
import { useState } from 'react';
import type { ReactNode } from 'react';
import SubmitPage from './pages/SubmitPage';
import MyComplaintsPage from './pages/MyComplaintsPage';
import ComplaintPage from './pages/ComplaintPage';
import SummaryPage from './pages/SummaryPage';
import QueuePage from './pages/QueuePage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import { AboutPage, DemoHint, ImitationBadge, useDemoHints } from './features/demo';
import { ImprovementsPage } from './features/improvements';
import { NotificationBell } from './features/notifications';
import { LastComplaintButton } from './features/ResumeComplaint';
import { useTheme } from './features/theme';
import type { ThemeChoice } from './features/theme';
import { CompletionSlot } from './features/completionSlot';
import { useDesignMotion } from './features/designMotion';
import './styles/tokens.css';
import './shell.css';
import './pages.css';
import './styles/interaction.css';

const navigation: Record<Role, { path: string; label: string }[]> = {
  employee: [{ path: '/my', label: 'Мои обращения' }, { path: '/submit', label: 'Новое обращение' }],
  manager: [{ path: '/queue', label: 'Очередь обращений' }, { path: '/dashboard', label: 'Дашборд' }],
  admin: [{ path: '/summary', label: 'Сводка' }, { path: '/dashboard', label: 'Дашборд' }, { path: '/admin', label: 'Пользователи и права' }],
};
const home: Record<Role, string> = { employee: '/my', manager: '/queue', admin: '/summary' };

function NavigationIcon({ path }: { path: string }) {
  return <svg className="navigation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {path === '/dashboard' ? <path d="M4 20h16M6 16v-5m6 5V5m6 11V8" />
      : path === '/submit' ? <path d="M12 5v14M5 12h14" />
        : path === '/admin' ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M17 11v6m-3-3h6" /></>
        : <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8m-8 3h8m-8 3h5" /></>}
  </svg>;
}

function RoleRoute({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  // Запоминаем запрошенный адрес (с фильтрами): после переключения на нужную роль вернёмся на него.
  // Если роль только что сменили и запрошенный ранее адрес ей доступен, идём на него, иначе на домашнюю страницу роли.
  if ((Array.isArray(role) ? role : [role]).includes(session.role)) return children;
  // Открытая карточка обращения сохраняется при смене роли: /queue/:id ↔ /my/:id (#203).
  const cardTarget = cardPath(location.pathname, session.role);
  const savedTarget = returnPath(location.state, session.role);
  const target = cardTarget ?? savedTarget ?? home[session.role];
  const required = Array.isArray(role) ? role : [role];
  const defaultLanding = (location.state as { defaultLanding?: unknown } | null)?.defaultLanding === true;
  return <Navigate to={target} replace state={!cardTarget && !savedTarget && !defaultLanding ? { from: `${location.pathname}${location.search}`, accessNotice: { required, forRole: session.role } } : null} />;
}

/** Адрес, который запрашивали до редиректа, если новая роль имеет к нему доступ. */
function returnPath(state: unknown, next: Role): string | undefined {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return undefined;
  const allowed = navigation[next].some(item => from === item.path || from.startsWith(`${item.path}/`) || from.startsWith(`${item.path}?`));
  return allowed ? from : undefined;
}

/** Required roles come only from known routes, never from a URL or history state. */
function requiredForPath(path: string): Role[] | undefined {
  if (path === '/my' || /^\/my\/[^/]+\/?$/.test(path) || path === '/submit') return ['employee'];
  if (path === '/queue' || /^\/queue\/[^/]+\/?$/.test(path)) return ['manager'];
  if (path === '/dashboard') return ['manager', 'admin'];
  if (path === '/summary' || path === '/admin') return ['admin'];
  return undefined;
}

/** Карточка обращения у каждой роли своя: сотрудник видит её на /my/:id, руководитель — на /queue/:id. */
const cardBase: Partial<Record<Role, string>> = { employee: '/my', manager: '/queue' };

/** Та же карточка обращения для новой роли, если сейчас открыта карточка и у новой роли она есть. */
function cardPath(pathname: string, next: Role): string | undefined {
  const match = /^\/(?:my|queue)\/([^/]+)\/?$/.exec(pathname);
  const base = cardBase[next];
  return match && base ? `${base}/${match[1]}` : undefined;
}

function Shell() {
  const { t } = useI18n();
  const { role, setRole, userId, userName, logout } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const hints = useDemoHints();
  const theme = useTheme();
  const motion = useDesignMotion();
  const [signalSlot, setSignalSlot] = useState<HTMLDivElement | null>(null);
  const state = location.state as { from?: unknown; defaultLanding?: boolean; accessNotice?: { required?: unknown; forRole?: unknown } } | null;
  const required = state?.accessNotice?.required;
  const validRoles = Array.isArray(required) && (required.join(',') === 'employee' || required.join(',') === 'manager' || required.join(',') === 'admin' || required.join(',') === 'manager,admin') && !required.includes(role);
  const noticeRoles = validRoles && state?.accessNotice?.forRole === role && location.pathname === home[role] ? required as Role[] : [];
  const noticeKey = noticeRoles.includes('manager') && noticeRoles.includes('admin') ? 'Эта страница доступна руководителю или администратору.'
    : noticeRoles.includes('manager') ? 'Эта страница доступна руководителю.'
      : noticeRoles.includes('admin') ? 'Эта страница доступна администратору.' : 'Эта страница доступна сотруднику.';
  const homeLabel: Record<Role, string> = { employee: 'Перейти к моим обращениям', manager: 'Перейти к очереди обращений', admin: 'Перейти к сводке' };

  function switchRole(next: string) {
    if (next !== 'employee' && next !== 'manager' && next !== 'admin') return;
    const cardTarget = cardPath(location.pathname, next);
    const savedTarget = returnPath(location.state, next);
    const target = cardTarget ?? savedTarget ?? home[next];
    const required = requiredForPath(location.pathname);
    const accessNotice = !cardTarget && !savedTarget && !state?.defaultLanding && required && !required.includes(next) ? { required, forRole: next } : undefined;
    setRole(next);
    navigate(target, { replace: true, state: accessNotice ? { accessNotice, from: `${location.pathname}${location.search}` } : null });
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main">{t("Перейти к содержимому")}</a>
    <header className="app-header">
      <Link className="brand" to={home[role]}><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M7 24V8l9 9 9-9v16M7 8l9 16 9-16" /></svg></span><span>{t("Модус Трейд")}<small>{t("Обратная связь сотрудников")}</small></span></Link>
      <label className="role-selector">{t("Демонстрационная роль")}<select value={role} onChange={event => switchRole(event.target.value)}><option value="employee">{t("Сотрудник")}</option><option value="manager">{t("Руководитель")}</option><option value="admin">{t("Администратор")}</option></select></label>
      <LanguageSelect />
      <ImitationBadge hint={t("выбор роли — не настоящий вход, пароля и учётной записи нет")} />
    </header>
    <aside className="demo-notice" aria-label={t("Демонстрация")}>{t("Демонстрация · только синтетические данные. Выбор роли имитирует вход.")}</aside>
    <div className="workspace">
      <aside className="workspace-sidebar">
        <p className="workspace-sidebar-title" aria-hidden="true">{t("Рабочее пространство")}</p>
        <nav aria-label={t("Основное меню")}>{navigation[role].map(item => <NavLink key={item.path} to={item.path}><NavigationIcon path={item.path} /><span>{t(item.label)}</span></NavLink>)}<LastComplaintButton key={role} /></nav>
        <div className="session-box"><span className="session-user">{demoAccounts.some(account => account.id === userId) ? t(demoAccounts.find(account => account.id === userId)!.title) : userName ?? t('Сотрудник')}</span><button type="button" className="logout-button" onClick={logout}>{t('Выйти')}</button></div>
        <div ref={setSignalSlot} className="completion-slot" />
      </aside>
      {/* Колокольчик стоит в DOM после меню (порядок Tab «шапка → меню» не меняется), а в шапку выводится стилями. */}
      {role !== 'admin' && <NotificationBell key={`bell-${role}`} role={role} />}
      <main id="main" tabIndex={-1} key={role}>
        {noticeRoles.length > 0 && <div className="demo-hint" role="status" aria-label={t('Ограничение доступа')}>
          <p>{t(noticeKey)}</p>
          <button type="button" onClick={() => navigate(home[role], { replace: true, state: typeof state?.from === 'string' ? { from: state.from } : null })}>{t(homeLabel[role])}</button>
        </div>}
        {hints.enabled && <DemoHint />}
        <CompletionSlot.Provider value={signalSlot}><Routes>
          <Route path="/" element={<Navigate to={home[role]} replace state={{ defaultLanding: true }} />} />
          <Route path="/my" element={<RoleRoute role="employee"><MyComplaintsPage /></RoleRoute>} />
          <Route path="/my/:complaintId" element={<RoleRoute role="employee"><ComplaintPage /></RoleRoute>} />
          <Route path="/submit" element={<RoleRoute role="employee"><SubmitPage /></RoleRoute>} />
          <Route path="/queue" element={<RoleRoute role="manager"><QueuePage /></RoleRoute>} />
          <Route path="/queue/:complaintId" element={<RoleRoute role="manager"><ComplaintPage /></RoleRoute>} />
          <Route path="/dashboard" element={<RoleRoute role={['manager', 'admin']}><DashboardPage /></RoleRoute>} />
          <Route path="/summary" element={<RoleRoute role="admin"><SummaryPage /></RoleRoute>} />
          <Route path="/admin" element={<RoleRoute role="admin"><AdminPage /></RoleRoute>} />
          <Route path="/improvements" element={<ImprovementsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<section className="section"><h1>{t("Страница не найдена")}</h1><Link to={home[role]}>{t("Вернуться к обращениям")}</Link></section>} />
        </Routes></CompletionSlot.Provider>
      </main>
    </div>
    {/* Демо-панель после основного содержимого: не мешает порядку Tab «шапка → меню → содержимое». */}
    <footer className="demo-controls" aria-label={t("Демонстрация")}><label className="theme-selector">{t("Тема")}<select value={theme.theme} onChange={event => theme.set(event.target.value as ThemeChoice)}><option value="system">{t("Как в системе")}</option><option value="light">{t("Светлая")}</option><option value="dark">{t("Тёмная")}</option></select></label><label className="checkbox-label hints-toggle"><input type="checkbox" checked={hints.enabled} onChange={event => hints.set(event.target.checked)} />{t("Подсказки демо")}</label><label className="checkbox-label hints-toggle"><input type="checkbox" checked={motion.enabled} onChange={event => motion.setEnabled(event.target.checked)} />{t("Анимации")}</label><Link to="/about">{t("О прототипе")}</Link></footer>
  </div>;
}

export default function App(props: { initialUserId?: string; onUserChange?: (userId: string) => void; onLogout?: () => void }) {
  return <I18nProvider><SessionProvider {...props}><Shell /></SessionProvider></I18nProvider>;
}
