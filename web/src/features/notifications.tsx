import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import type { components } from '../api/client';
import { ImitationBadge } from './demo';

type Notification = components['schemas']['Notification'];

export const POLL_INTERVAL_MS = 30_000;
export const IMITATION_NOTE = 'Имитация: в промышленной версии email / Битрикс24';
const IMITATION_HINT = 'в промышленной версии email / Битрикс24';
const storageKey = (role: string) => `notifications:lastSeen:${role}`;

function readLastSeen(role: string): string | null {
  try { return localStorage.getItem(storageKey(role)); } catch { return null; }
}
function writeLastSeen(role: string, value: string) {
  try { localStorage.setItem(storageKey(role), value); } catch { /* хранилище недоступно: метка живёт до перезагрузки */ }
}
const time = (value: string | null) => { const parsed = value ? Date.parse(value) : NaN; return Number.isNaN(parsed) ? -Infinity : parsed; };

/** Лента событий: первый запрос целиком, далее раз в 30 с с `since` = метка lastSeen; события склеиваются по id. */
function useNotifications(role: string) {
  const { api } = useSession();
  const [items, setItems] = useState<Notification[]>([]);
  const [lastSeen, setLastSeenState] = useState<string | null>(() => readLastSeen(role));
  const lastSeenRef = useRef(lastSeen);

  const load = useCallback(async () => {
    try {
      const since = lastSeenRef.current ?? undefined;
      const { data } = await api.GET('/notifications', { params: { query: since ? { since } : {} } });
      const fresh = Array.isArray(data?.items) ? data.items : [];
      if (fresh.length === 0) return;
      setItems(current => {
        const byId = new Map(current.map(entry => [entry.id, entry]));
        for (const entry of fresh) byId.set(entry.id, entry);
        return [...byId.values()].sort((a, b) => time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id));
      });
    } catch { /* сеть или сервер недоступны: оставляем прежний список, повторим через 30 с */ }
  }, [api]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const markSeen = useCallback(() => {
    const newest = items.reduce<string | null>((best, entry) => (time(entry.createdAt) > time(best) ? entry.createdAt : best), lastSeenRef.current);
    if (newest && newest !== lastSeenRef.current) {
      lastSeenRef.current = newest;
      setLastSeenState(newest);
      writeLastSeen(role, newest);
    }
  }, [items, role]);

  const unread = items.filter(entry => time(entry.createdAt) > time(lastSeen)).length;
  return { items, unread, markSeen };
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Колокольчик уведомлений (R8): имитация ленты событий внутри приложения. */
export function NotificationBell({ role }: { role: string }) {
  const { items, unread, markSeen } = useNotifications(role);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close(restoreFocus = false) {
    setOpen(false);
    markSeen();
    if (restoreFocus) buttonRef.current?.focus();
  }
  const label = unread > 0 ? `Уведомления, новых: ${unread}` : 'Уведомления';

  return <div className="notification-bell" onKeyDown={event => { if (open && event.key === 'Escape') close(true); }}>
    <button ref={buttonRef} type="button" className="notification-button" aria-label={label} aria-expanded={open} aria-controls={panelId} onClick={() => (open ? close() : setOpen(true))}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
      {unread > 0 && <span className="notification-count" aria-hidden="true">{unread}</span>}
    </button>
    {open && <section id={panelId} className="notification-panel" role="region" aria-label="Уведомления">
      <h2 className="notification-title">Уведомления <ImitationBadge hint={IMITATION_HINT} /></h2>
      {items.length === 0
        ? <p className="muted notification-empty">Новых уведомлений нет</p>
        : <ul className="notification-list">{items.map(entry => <li key={entry.id}>
          <Link to={entry.href} onClick={() => close()}>{entry.message}</Link>{entry.simulated && <> <ImitationBadge hint="создано демо-симулятором" /></>}
          <small className="muted">{entry.complaintNumber} · {formatTime(entry.createdAt)}</small>
        </li>)}</ul>}
      <p className="notification-note">{IMITATION_NOTE}</p>
    </section>}
  </div>;
}
