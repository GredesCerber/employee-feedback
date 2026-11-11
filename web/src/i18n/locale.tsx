import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { catalogs } from './messages';
import type { Messages, Plural } from './messages';

export type Locale = 'ru' | 'en' | 'kk';
export const LOCALES: Locale[] = ['ru', 'en', 'kk'];
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'employee-feedback.locale';

const intlTags: Record<Locale, string> = { ru: 'ru-RU', en: 'en-US', kk: 'kk-KZ' };

/** Сохранённый язык или русский, если выбор испорчен или хранилище недоступно. */
export function readStoredLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.includes(value as Locale) ? value as Locale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function writeStoredLocale(value: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, value);
  } catch { /* хранилище недоступно: выбор действует до перезагрузки */ }
}

/** Категория множественного числа по правилам языка (ru: one/few/many/other, en и kk: one/other). */
export function pluralCategory(locale: Locale, count: number): keyof Plural {
  return new Intl.PluralRules(intlTags[locale]).select(count) as keyof Plural;
}

type Value = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (pick: (messages: Messages) => string) => string;
  plural: (pick: (messages: Messages) => Plural, count: number) => string;
  formatDate: (date: Date | string) => string;
  formatNumber: (value: number) => string;
};

function makeValue(locale: Locale, setLocale: (next: Locale) => void): Value {
  const messages = catalogs[locale];
  return {
    locale,
    setLocale,
    t: pick => pick(messages),
    plural: (pick, count) => pick(messages)[pluralCategory(locale, count)].replace('{count}', new Intl.NumberFormat(intlTags[locale]).format(count)),
    formatDate: date => new Intl.DateTimeFormat(intlTags[locale], { dateStyle: 'medium' }).format(typeof date === 'string' ? new Date(date) : date),
    formatNumber: number => new Intl.NumberFormat(intlTags[locale]).format(number),
  };
}

// Без провайдера интерфейс остаётся русским (не падает), смена языка работает только внутри провайдера.
const LocaleContext = createContext<Value>(makeValue(DEFAULT_LOCALE, () => undefined));

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => makeValue(locale, next => { setLocaleState(next); writeStoredLocale(next); }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Value {
  return useContext(LocaleContext);
}
