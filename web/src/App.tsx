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
  const target = returnPath(location.state, session.role) ?? home[session.role];
  return <Navigate to={target} replace state={{ from: `${location.pathname}${location.search}` }} />;
}

/** Адрес, который запрашивали до редиректа, если новая роль имеет к нему доступ. */
function returnPath(state: unknown, next: Role): string | undefined {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return undefined;
  const allowed = navigation[next].some(item => from === item.path || from.startsWith(`${item.path}/`) || from.startsWith(`${item.path}?`));
  return allowed ? from : undefined;
}

function Shell() {
  const { role, setRole } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const hints = useDemoHints();
  const theme = useTheme();
  function switchRole(next: string) {
    if (next !== 'employee' && next !== 'manager' && next !== 'admin') return;
    setRole(next);
    navigate(returnPath(location.state, next) ?? home[next], { replace: true });
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <header className="app-header">
      <Link className="brand" to={home[role]}><span className="brand-mark" aria-hidden="true">М</span><span>Модус Трейд<small>Обратная связь сотрудников</small></span></Link>
      <label className="role-selector">Демонстрационная роль<select value={role} onChange={event => switchRole(event.target.value)}><option value="employee">Сотрудник</option><option value="manager">Руководитель</option><option value="admin">Администратор</option></select></label>
      <ImitationBadge hint="выбор роли — не настоящий вход, пароля и учётной записи нет" />
    </header>
    <p className="demo-notice">Демонстрация · только синтетические данные. Выбор роли имитирует вход.</p>
    <div className="workspace">
      <nav aria-label="Основное меню">{navigation[role].map(item => <NavLink key={item.path} to={item.path}>{item.label}</NavLink>)}</nav>
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
          <Route path="*" element={<section className="section"><h1>Страница не найдена</h1><Link to={home[role]}>Вернуться к обращениям</Link></section>} />
        </Routes>
      </main>
    </div>
    {/* Демо-панель после основного содержимого: не мешает порядку Tab «шапка → меню → содержимое». */}
    <footer className="demo-controls" aria-label="Демонстрация"><label className="theme-selector">Тема<select value={theme.theme} onChange={event => theme.set(event.target.value as ThemeChoice)}><option value="system">Как в системе</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label><label className="checkbox-label hints-toggle"><input type="checkbox" checked={hints.enabled} onChange={event => hints.set(event.target.checked)} />Подсказки демо</label><Link to="/about">О прототипе</Link></footer>
  </div>;
}

export default function App() { return <SessionProvider><Shell /></SessionProvider>; }
