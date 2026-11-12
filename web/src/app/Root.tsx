import { useCallback, useState } from 'react';
import App from '../App';
import { I18nProvider } from '../i18n';
import LoginPage from './LoginPage';
import { readStoredUser, writeStoredUser } from './session';

/** Условный вход: пока роль не выбрана, показываем экран входа; выбор запоминается в браузере. */
export default function Root() {
  const [userId, setUserId] = useState<string | null>(readStoredUser);
  const login = useCallback((id: string) => { writeStoredUser(id); setUserId(id); }, []);
  const logout = useCallback(() => { writeStoredUser(null); setUserId(null); }, []);
  if (!userId) return <I18nProvider><LoginPage onLogin={login} /></I18nProvider>;
  return <App initialUserId={userId} onUserChange={writeStoredUser} onLogout={logout} />;
}
