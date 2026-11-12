import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, createApiClient } from '../api/client';
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

export type Account = (typeof demoAccounts)[number];

/** Пользователи, которых администратор добавил или чью роль изменил: роль берём у API, а не из жёсткого списка. */
const knownRoles = new Map<string, Role>();
/** Встроенные демо-учётки плюс то, что вернул API (новые участники, смена роли). */
export function mergeAccounts(users: { id: string; name: string; role: Role }[]): Account[] {
  for (const user of users) knownRoles.set(user.id, user.role);
  const fixed = demoAccounts.map(account => ({ ...account, role: knownRoles.get(account.id) ?? account.role }));
  const extra = users.filter(user => !demoAccounts.some(account => account.id === user.id))
    .map((user): Account => ({ id: user.id, role: user.role, title: user.name, hint: 'Добавлен администратором' }));
  return [...fixed.filter(account => users.length === 0 || users.some(user => user.id === account.id)), ...extra];
}
const isRole = (value: unknown): value is Role => value === 'employee' || value === 'manager' || value === 'admin';
/** Роль по id: встроенная учётка, ответ API или префикс сгенерированного id (employee-12). */
function roleOf(userId: string): Role {
  return knownRoles.get(userId) ?? demoAccounts.find(account => account.id === userId)?.role
    ?? (/^(employee|manager|admin)-\d+$/.exec(userId)?.[1] as Role | undefined) ?? 'employee';
}

export const SESSION_STORAGE_KEY = 'demo-session';
export function readStoredUser(): string | null {
  try {
    const id = localStorage.getItem(SESSION_STORAGE_KEY);
    // Добавленный администратором участник проверяется по /session после загрузки.
    return id && (demoAccounts.some(account => account.id === id) || /^(employee|manager|admin)-\d+$/.test(id)) ? id : null;
  } catch { return null; }
}
export function writeStoredUser(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_STORAGE_KEY, id); else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* хранилище недоступно: вход действует до перезагрузки */ }
}

type Session = { role: Role; userId: string; userName?: string; setRole: (role: Role) => void; api: ApiClient; logout: () => void };
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children, initialUserId, onUserChange, onLogout }: {
  children: ReactNode; initialUserId?: string; onUserChange?: (userId: string) => void; onLogout?: () => void;
}) {
  const [userId, setUserId] = useState(initialUserId ?? demoUsers.employee);
  const [syncedRole, setSyncedRole] = useState<{ userId: string; role: Role; name: string } | null>(null);
  const role: Role = syncedRole?.userId === userId ? syncedRole.role : roleOf(userId);
  const api = useMemo(() => createApiClient({ userId }), [userId]);
  // Роль и активность пользователя определяет сервер: администратор мог её сменить или деактивировать учётку.
  useEffect(() => {
    // Встроенные учётки известны заранее; запрос нужен только добавленным участникам.
    if (demoAccounts.some(account => account.id === userId)) return;
    let active = true;
    api.GET('/session').then(({ data }) => {
      if (active && data && isRole(data.role)) { knownRoles.set(userId, data.role); setSyncedRole({ userId, role: data.role, name: data.name }); }
    }).catch(error => { if (active && error instanceof ApiError && error.status === 401) onLogout?.(); });
    return () => { active = false; };
  }, [api, userId, onLogout]);
  const value = useMemo<Session>(() => ({
    role, userId, userName: syncedRole?.userId === userId ? syncedRole.name : undefined,
    setRole: next => { const id = demoUsers[next]; setUserId(id); onUserChange?.(id); },
    api,
    logout: () => onLogout?.(),
  }), [role, userId, syncedRole, api, onUserChange, onLogout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
