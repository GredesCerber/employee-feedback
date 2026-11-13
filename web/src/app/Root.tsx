import { useCallback, useEffect, useState } from 'react';
import App from '../App';
import { I18nProvider } from '../i18n';
import LoginPage from './LoginPage';
import { createApiClient, writeAuthSession } from '../api/client';
import { demoAccounts, mergeAccounts, readStoredUser, writeStoredUser } from './session';
import type { Account } from './session';

/** Условный вход: пока роль не выбрана, показываем экран входа; выбор запоминается в браузере. */
export default function Root() {
  const [userId, setUserId] = useState<string | null>(readStoredUser);
  const login = useCallback((id: string, token?: string) => {
    writeAuthSession(token ? { userId: id, token } : null);
    writeStoredUser(id); setUserId(id);
  }, []);
  const logout = useCallback(() => {
    // Выход попадает в журнал действий; результат запроса не важен для выхода из интерфейса.
    if (userId) void createApiClient({ userId }).POST('/auth/logout').catch(() => undefined);
    writeAuthSession(null); writeStoredUser(null); setUserId(null);
  }, [userId]);
  const [accounts, setAccounts] = useState<Account[]>(demoAccounts);
  // Экран входа показывает и тех, кого администратор добавил; без ответа сервера остаются встроенные учётки.
  useEffect(() => {
    if (userId) return;
    let active = true;
    createApiClient({ userId: 'anonymous' }).GET('/demo-accounts').then(({ data }) => {
      if (active && Array.isArray(data?.items)) setAccounts(mergeAccounts(data.items));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);
  if (!userId) return <I18nProvider><LoginPage onLogin={login} accounts={accounts} /></I18nProvider>;
  return <App initialUserId={userId} onUserChange={writeStoredUser} onLogout={logout} />;
}
