import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  LOCALE_STORAGE_KEY, LocaleProvider, pluralCategory, readStoredLocale, useLocale,
} from '../src/i18n/locale';
import { catalogs } from '../src/i18n/messages';

function keysOf(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

function Probe() {
  const { locale, setLocale, t, plural, formatDate } = useLocale();
  return <div>
    <p data-testid="nav">{t(m => m.nav.queue)}</p>
    <p data-testid="count">{plural(m => m.complaints.count, 21)}</p>
    <p data-testid="date">{formatDate(new Date('2026-11-11T10:00:00Z'))}</p>
    <button type="button" onClick={() => setLocale('kk')}>kk</button>
    <button type="button" onClick={() => setLocale('en')}>en</button>
    <span data-testid="current">{locale}</span>
  </div>;
}

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('lang'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('UX-08 locale foundation', () => {
  it('ru, en and kk catalogs have exactly the same keys', () => {
    const ru = keysOf(catalogs.ru).sort();
    expect(keysOf(catalogs.en).sort()).toEqual(ru);
    expect(keysOf(catalogs.kk).sort()).toEqual(ru);
  });

  it('defaults to Russian and survives invalid or unavailable storage', () => {
    expect(readStoredLocale()).toBe('ru');
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    expect(readStoredLocale()).toBe('ru');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readStoredLocale()).toBe('ru');
  });

  it('switches language, sets html lang, saves the choice and restores it after reload', () => {
    const first = render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByTestId('nav').textContent).toBe(catalogs.ru.nav.queue);
    fireEvent.click(screen.getByRole('button', { name: 'kk' }));
    expect(screen.getByTestId('current').textContent).toBe('kk');
    expect(document.documentElement.lang).toBe('kk');
    expect(screen.getByTestId('nav').textContent).toBe(catalogs.kk.nav.queue);
    first.unmount();
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByTestId('current').textContent).toBe('kk');
    expect(document.documentElement.lang).toBe('kk');
  });

  it('applies the same plural rule per language', () => {
    expect(pluralCategory('ru', 1)).toBe('one');
    expect(pluralCategory('ru', 2)).toBe('few');
    expect(pluralCategory('ru', 5)).toBe('many');
    expect(pluralCategory('ru', 21)).toBe('one');
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 0)).toBe('other');
    expect(pluralCategory('kk', 5)).toBe('other');
  });

  it('formats dates with the selected locale through Intl', () => {
    const date = new Date('2026-11-11T10:00:00Z');
    const expected = new Intl.DateTimeFormat('kk-KZ', { dateStyle: 'medium' }).format(date);
    localStorage.setItem(LOCALE_STORAGE_KEY, 'kk');
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByTestId('date').textContent).toBe(expected);
  });

  it('renders the plural form for the active language', () => {
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByTestId('count').textContent).toBe('21 обращение');
    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(screen.getByTestId('count').textContent).toBe('21 complaints');
  });
});
