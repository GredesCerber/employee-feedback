import { useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from '../i18n';
import { createApiClient } from '../api/client';
import LanguageSelect from '../i18n/LanguageSelect';
import { demoAccounts } from './session';
import type { Account, Role } from './session';
import { useTheme } from '../features/theme';

const roleTitle: Record<Role, string> = { employee: 'Сотрудник', manager: 'Руководитель', admin: 'Администратор' };

/** Экран условного входа: выбор роли без пароля (имитация входа для демо). */
export default function LoginPage({ onLogin, accounts = demoAccounts }: { onLogin: (userId: string, token?: string) => void; accounts?: Account[] }) {
  useTheme();
  const { t } = useI18n();
  const [passwordMode, setPasswordMode] = useState(false);
  const [credentials, setCredentials] = useState({ login: '', password: '' });
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setFailure(''); setBusy(true);
    try {
      const { data } = await createApiClient({ userId: 'anonymous' }).POST('/auth/login', { body: { login: credentials.login.trim(), password: credentials.password } });
      if (data) onLogin(data.user.id, data.token);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Не удалось войти.');
    } finally { setBusy(false); }
  }
  return <main className="login-page" id="main">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-top">
        <p className="login-brand">{t('Модус Трейд')}</p>
        <LanguageSelect className="role-selector login-language" />
      </div>
      <h1 id="login-title">{t('Вход в систему')}</h1>
      <p className="login-lead">{t('Выберите, под кем войти. Пароль не нужен: это демонстрация на синтетических данных.')}</p>
      <div className="login-mode">
        <button type="button" className="login-mode-toggle" aria-expanded={passwordMode} onClick={() => setPasswordMode(open => !open)}>
          {t('Войти по учётной записи')}
        </button>
      </div>
      {passwordMode && <form className="login-password" onSubmit={signIn} aria-label={t('Вход по логину и паролю')}>
        <label>{t('Логин (код или ФИО)')}<input autoComplete="username" value={credentials.login} required maxLength={200}
          onChange={event => setCredentials({ ...credentials, login: event.target.value })} /></label>
        <label>{t('Пароль')}<input type="password" autoComplete="current-password" value={credentials.password} required maxLength={100}
          onChange={event => setCredentials({ ...credentials, password: event.target.value })} /></label>
        {failure && <p className="field-error" role="alert">{failure}</p>}
        <button type="submit" disabled={busy || !credentials.login.trim() || !credentials.password}>{t('Войти')}</button>
      </form>}
      <p className="login-lead">{t('Или быстро выберите роль для демонстрации:')}</p>
      <ul className="login-accounts">
        {accounts.map(account => <li key={account.id}>
          <button type="button" className="login-account" onClick={() => onLogin(account.id)}>
            <span className="login-role">{t(roleTitle[account.role])}</span>
            <strong>{account.hint === 'Добавлен администратором' ? account.title : t(account.title)}</strong>
            <small>{t(account.hint)}</small>
            <span className="login-action">{t('Войти как')} {t(roleTitle[account.role]).toLowerCase()}</span>
          </button>
        </li>)}
      </ul>
      <p className="login-note">{t('Данные демо можно сбросить кнопкой администратора, поэтому смело пробуйте любые действия.')}</p>
    </section>
  </main>;
}
