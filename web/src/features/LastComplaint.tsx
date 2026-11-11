import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { demoUsers, useSession } from '../app/session';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n';
import { readLastComplaint, saveLastComplaint, useLastComplaint } from './lastComplaintStore';
import './lastComplaint.css';

const copy = {
  ru: { button: 'Вернуться к обращению', busy: 'Проверяем доступ…', unavailable: 'Обращение недоступно. Откройте список обращений.', network: 'Не удалось проверить обращение. Проверьте соединение и попробуйте снова.' },
  en: { button: 'Return to complaint', busy: 'Checking access…', unavailable: 'This complaint is unavailable. Open the complaints list.', network: 'Could not check the complaint. Check your connection and try again.' },
  kk: { button: 'Өтінішке оралу', busy: 'Қолжетімділік тексерілуде…', unavailable: 'Өтініш қолжетімсіз. Өтініштер тізімін ашыңыз.', network: 'Өтінішті тексеру мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.' },
};

export function LastComplaintButton() {
  const { role, api } = useSession();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const id = useLastComplaint(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ scope: string; text: string } | null>(null);
  const scope = `${role}:${demoUsers[role]}`;
  const current = useRef({ scope, generation: 0 });
  if (current.current.scope !== scope) current.current = { scope, generation: current.current.generation + 1 };
  const labels = copy[locale];
  const path = id ? `/${role === 'manager' ? 'queue' : 'my'}/${encodeURIComponent(id)}` : '';
  const visibleError = error?.scope === scope ? error.text : '';
  if (role === 'admin' || (id && location.pathname === path)) return null;
  if (!id && !visibleError) return null;

  async function resume() {
    if (!id || busy) return;
    const requestedScope = scope;
    const generation = current.current.generation;
    setError(null);
    setBusy(true);
    try {
      const result = await api.GET('/complaints/{complaintId}', { params: { path: { complaintId: id } } });
      if (current.current.generation !== generation || readLastComplaint(role) !== id) return;
      if (result.response.status === 403 || result.response.status === 404) {
        saveLastComplaint(role, null);
        setError({ scope: requestedScope, text: labels.unavailable });
      } else if (result.response.ok && result.data) navigate(path);
      else setError({ scope: requestedScope, text: labels.network });
    } catch (error) {
      if (current.current.generation === generation && readLastComplaint(role) === id) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          saveLastComplaint(role, null);
          setError({ scope: requestedScope, text: labels.unavailable });
        } else setError({ scope: requestedScope, text: labels.network });
      }
    } finally { setBusy(false); }
  }
  return <div className="last-complaint">{id && <button type="button" disabled={busy} onClick={resume}>{busy ? labels.busy : labels.button}</button>}{visibleError && <p role="alert">{visibleError}</p>}</div>;
}
