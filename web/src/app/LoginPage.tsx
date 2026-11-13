import { useI18n } from '../i18n';
import LanguageSelect from '../i18n/LanguageSelect';
import { demoAccounts } from './session';
import type { Account, Role } from './session';

const roleTitle: Record<Role, string> = { employee: 'Сотрудник', manager: 'Руководитель', admin: 'Администратор' };

/** Экран условного входа: выбор роли без пароля (имитация входа для демо). */
export default function LoginPage({ onLogin, accounts = demoAccounts }: { onLogin: (userId: string) => void; accounts?: Account[] }) {
  const { t } = useI18n();
  return <main className="login-page" id="main">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-top">
        <p className="login-brand">{t('Модус Трейд')}</p>
        <LanguageSelect className="role-selector login-language" />
      </div>
      <h1 id="login-title">{t('Вход в систему')}</h1>
      <p className="login-lead">{t('Выберите, под кем войти. Пароль не нужен: это демонстрация на синтетических данных.')}</p>
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
