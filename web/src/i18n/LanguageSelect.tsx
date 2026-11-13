import { useI18n } from './index';
import type { Locale } from './locale';

/** Общий переключатель языка: шапка приложения и экран входа; выбор сохраняется провайдером. */
export default function LanguageSelect({ className = 'role-selector' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return <label className={className}>
    <span>{t("Language / Язык / Тіл")}</span>
    <select value={locale} onChange={event => setLocale(event.target.value as Locale)}>
      <option value="ru">{t("Русский")}</option>
      <option value="en">English</option>
      <option value="kk">{t("Қазақша")}</option>
    </select>
  </label>;
}
