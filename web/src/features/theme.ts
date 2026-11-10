import { useEffect, useState } from 'react';

/** Тема интерфейса (#106): «как в системе» (prefers-color-scheme), светлая или тёмная. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'theme';

function readStored(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function writeStored(value: ThemeChoice) {
  try {
    if (value === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch { /* хранилище недоступно: выбор действует до перезагрузки */ }
}

/** Выбор темы с памятью; значение ставится атрибутом data-theme на <html>, токены берут его из tokens.css. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(readStored);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
  return { theme, set(value: ThemeChoice) { setTheme(value); writeStored(value); } };
}
