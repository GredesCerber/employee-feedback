import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { SessionProvider, useSession } from './app/session';
import type { Role } from './app/session';
import type { ReactNode } from 'react';
import SubmitPage from './pages/SubmitPage';
import MyComplaintsPage from './pages/MyComplaintsPage';
import ComplaintPage from './pages/ComplaintPage';
import SummaryPage from './pages/SummaryPage';
import QueuePage from './pages/QueuePage';
import './shell.css';
import './pages.css';

const navigation: Record<Role, { path: string; label: string }[]> = {
  employee: [{ path: '/my', label: 'Мои обращения' }, { path: '/submit', label: 'Новое обращение' }],
  manager: [{ path: '/queue', label: 'Очередь обращений' }],
  admin: [{ path: '/summary', label: 'Сводка' }],
};
const home: Record<Role, string> = { employee: '/my', manager: '/queue', admin: '/summary' };

function RoleRoute({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  return session.role === role ? children : <Navigate to={home[session.role]} replace />;
}

function Shell() {
  const { role, setRole } = useSession();
  const navigate = useNavigate();
  function switchRole(next: string) {
    if (next !== 'employee' && next !== 'manager' && next !== 'admin') return;
    setRole(next);
    navigate(home[next], { replace: true });
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <header className="app-header">
      <Link className="brand" to={home[role]}><span className="brand-mark" aria-hidden="true">М</span><span>Модус Трейд<small>Обратная связь сотрудников</small></span></Link>
      <label className="role-selector">Демонстрационная роль<select value={role} onChange={event => switchRole(event.target.value)}><option value="employee">Сотрудник</option><option value="manager">Руководитель</option><option value="admin">Администратор</option></select></label>
    </header>
    <p className="demo-notice">Демонстрация · только синтетические данные. Выбор роли имитирует вход.</p>
    <div className="workspace">
      <nav aria-label="Основное меню">{navigation[role].map(item => <NavLink key={item.path} to={item.path}>{item.label}</NavLink>)}</nav>
      <main id="main" tabIndex={-1} key={role}>
        <Routes>
          <Route path="/" element={<Navigate to={home[role]} replace />} />
          <Route path="/my" element={<RoleRoute role="employee"><MyComplaintsPage /></RoleRoute>} />
          <Route path="/my/:complaintId" element={<RoleRoute role="employee"><ComplaintPage /></RoleRoute>} />
          <Route path="/submit" element={<RoleRoute role="employee"><SubmitPage /></RoleRoute>} />
          <Route path="/queue" element={<RoleRoute role="manager"><QueuePage /></RoleRoute>} />
          <Route path="/queue/:complaintId" element={<RoleRoute role="manager"><ComplaintPage /></RoleRoute>} />
          <Route path="/summary" element={<RoleRoute role="admin"><SummaryPage /></RoleRoute>} />
          <Route path="*" element={<section className="section"><h1>Страница не найдена</h1><Link to={home[role]}>Вернуться к обращениям</Link></section>} />
        </Routes>
      </main>
    </div>
  </div>;
}

export default function App() { return <SessionProvider><Shell /></SessionProvider>; }
