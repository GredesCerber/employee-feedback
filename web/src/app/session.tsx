import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createApiClient } from '../api/client';
import type { ApiClient, components } from '../api/client';

export type Role = components['schemas']['Role'];
export const demoUsers: Record<Role, string> = { employee: 'employee-1', manager: 'manager-1', admin: 'admin-1' };

/** Демо-учётки для экрана входа: пароля нет, личность выбирается кнопкой (X-Demo-User). */
export const demoAccounts: { id: string; role: Role; title: string; hint: string }[] = [
  { id: 'employee-1', role: 'employee', title: 'Сотрудник закупок', hint: 'Подаёт обращения и следит за ответами' },
  { id: 'employee-2', role: 'employee', title: 'Сотрудник бухгалтерии', hint: 'Второй автор: видит только свои обращения' },
  { id: 'manager-1', role: 'manager', title: 'Руководитель', hint: 'Очередь, назначение, статусы и решения' },
  { id: 'admin-1', role: 'admin', title: 'Администратор', hint: 'Сводка, аналитика и сброс демо-данных' },
];

export const SESSION_STORAGE_KEY = 'demo-session';
export function readStoredUser(): string | null {
  try {
    const id = localStorage.getItem(SESSION_STORAGE_KEY);
    return demoAccounts.some(account => account.id === id) ? id : null;
  } catch { return null; }
}
export function writeStoredUser(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_STORAGE_KEY, id); else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* хранилище недоступно: вход действует до перезагрузки */ }
}

type Session = { role: Role; userId: string; setRole: (role: Role) => void; api: ApiClient; logout: () => void };
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children, initialUserId, onUserChange, onLogout }: {
  children: ReactNode; initialUserId?: string; onUserChange?: (userId: string) => void; onLogout?: () => void;
}) {
  const [userId, setUserId] = useState(initialUserId ?? demoUsers.employee);
  const role: Role = demoAccounts.find(account => account.id === userId)?.role ?? 'employee';
  const value = useMemo<Session>(() => ({
    role, userId,
    setRole: next => { const id = demoUsers[next]; setUserId(id); onUserChange?.(id); },
    api: createApiClient({ userId }),
    logout: () => onLogout?.(),
  }), [role, userId, onUserChange, onLogout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
