import { I18nProvider, useI18n, type Locale } from './i18n';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { SessionProvider, useSession } from './app/session';
import type { Role } from './app/session';
import type { ReactNode } from 'react';
import SubmitPage from './pages/SubmitPage';
import MyComplaintsPage from './pages/MyComplaintsPage';
import ComplaintPage from './pages/ComplaintPage';
import SummaryPage from './pages/SummaryPage';
import QueuePage from './pages/QueuePage';
import DashboardPage from './pages/DashboardPage';
import { AboutPage, DemoHint, ImitationBadge, useDemoHints } from './features/demo';
import { NotificationBell } from './features/notifications';
import { LastComplaintButton } from './features/ResumeComplaint';
import { useTheme } from './features/theme';
import type { ThemeChoice } from './features/theme';
import './styles/tokens.css';
import './shell.css';
import './pages.css';

const navigation: Record<Role, { path: string; label: string }[]> = {
  employee: [{ path: '/my', label: 'Мои обращения' }, { path: '/submit', label: 'Новое обращение' }],
  manager: [{ path: '/queue', label: 'Очередь обращений' }, { path: '/dashboard', label: 'Дашборд' }],
  admin: [{ path: '/summary', label: 'Сводка' }, { path: '/dashboard', label: 'Дашборд' }],
};
const home: Record<Role, string> = { employee: '/my', manager: '/queue', admin: '/summary' };

function RoleRoute({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  // Запоминаем запрошенный адрес (с фильтрами): после переключения на нужную роль вернёмся на него.
  // Если роль только что сменили и запрошенный ранее адрес ей доступен, идём на него, иначе на домашнюю страницу роли.
  if ((Array.isArray(role) ? role : [role]).includes(session.role)) return children;
  // Открытая карточка обращения сохраняется при смене роли: /queue/:id ↔ /my/:id (#203).
  const target = cardPath(location.pathname, session.role) ?? returnPath(location.state, session.role) ?? home[session.role];
  return <Navigate to={target} replace state={{ from: `${location.pathname}${location.search}` }} />;
}

/** Адрес, который запрашивали до редиректа, если новая роль имеет к нему доступ. */
function returnPath(state: unknown, next: Role): string | undefined {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return undefined;
  const allowed = navigation[next].some(item => from === item.path || from.startsWith(`${item.path}/`) || from.startsWith(`${item.path}?`));
  return allowed ? from : undefined;
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
  const { t, locale, setLocale } = useI18n();
  const { role, setRole } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const hints = useDemoHints();
  const theme = useTheme();
  function switchRole(next: string) {
    if (next !== 'employee' && next !== 'manager' && next !== 'admin') return;
    setRole(next);
    navigate(cardPath(location.pathname, next) ?? returnPath(location.state, next) ?? home[next], { replace: true });
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main">{t("Перейти к содержимому")}</a>
    <header className="app-header">
      <Link className="brand" to={home[role]}><span className="brand-mark" aria-hidden="true">{t("М")}</span><span>{t("Модус Трейд")}<small>{t("Обратная связь сотрудников")}</small></span></Link>
      <label className="role-selector">{t("Демонстрационная роль")}<select value={role} onChange={event => switchRole(event.target.value)}><option value="employee">{t("Сотрудник")}</option><option value="manager">{t("Руководитель")}</option><option value="admin">{t("Администратор")}</option></select></label>
      <label className="language-selector">Language / Язык / Тіл<select aria-label="Language / Язык / Тіл" value={locale} onChange={event => setLocale(event.target.value as Locale)}><option value="ru">Русский</option><option value="en">English</option><option value="kk">Қазақша</option></select></label>
      <ImitationBadge hint={t("выбор роли — не настоящий вход, пароля и учётной записи нет")} />
    </header>
    <p className="demo-notice">{t("Демонстрация · только синтетические данные. Выбор роли имитирует вход.")}</p>
    <div className="workspace">
      <nav aria-label={t("Основное меню")}>{navigation[role].map(item => <NavLink key={item.path} to={item.path}>{t(item.label)}</NavLink>)}<LastComplaintButton key={role} /></nav>
      {/* Колокольчик стоит в DOM после меню (порядок Tab «шапка → меню» не меняется), а в шапку выводится стилями. */}
      {role !== 'admin' && <NotificationBell key={`bell-${role}`} role={role} />}
      <main id="main" tabIndex={-1} key={role}>
        {hints.enabled && <DemoHint />}
        <Routes>
          <Route path="/" element={<Navigate to={home[role]} replace />} />
          <Route path="/my" element={<RoleRoute role="employee"><MyComplaintsPage /></RoleRoute>} />
          <Route path="/my/:complaintId" element={<RoleRoute role="employee"><ComplaintPage /></RoleRoute>} />
          <Route path="/submit" element={<RoleRoute role="employee"><SubmitPage /></RoleRoute>} />
          <Route path="/queue" element={<RoleRoute role="manager"><QueuePage /></RoleRoute>} />
          <Route path="/queue/:complaintId" element={<RoleRoute role="manager"><ComplaintPage /></RoleRoute>} />
          <Route path="/dashboard" element={<RoleRoute role={['manager', 'admin']}><DashboardPage /></RoleRoute>} />
          <Route path="/summary" element={<RoleRoute role="admin"><SummaryPage /></RoleRoute>} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<section className="section"><h1>{t("Страница не найдена")}</h1><Link to={home[role]}>{t("Вернуться к обращениям")}</Link></section>} />
        </Routes>
      </main>
    </div>
    {/* Демо-панель после основного содержимого: не мешает порядку Tab «шапка → меню → содержимое». */}
    <footer className="demo-controls" aria-label={t("Демонстрация")}><label className="theme-selector">{t("Тема")}<select value={theme.theme} onChange={event => theme.set(event.target.value as ThemeChoice)}><option value="system">{t("Как в системе")}</option><option value="light">{t("Светлая")}</option><option value="dark">{t("Тёмная")}</option></select></label><label className="checkbox-label hints-toggle"><input type="checkbox" checked={hints.enabled} onChange={event => hints.set(event.target.checked)} />{t("Подсказки демо")}</label><Link to="/about">{t("О прототипе")}</Link></footer>
  </div>;
}

export default function App() { return <I18nProvider><SessionProvider><Shell /></SessionProvider></I18nProvider>; }
