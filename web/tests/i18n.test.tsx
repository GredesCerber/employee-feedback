import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, catalog, useI18n } from '../src/i18n';
import { dateLabel } from '../src/features/complaint';

function Example() {
  const { locale, setLocale, t } = useI18n();
  return <><label>Language<select value={locale} onChange={event => setLocale(event.target.value as 'ru' | 'en' | 'kk')}><option value="ru">Русский</option><option value="en">English</option><option value="kk">Қазақша</option></select></label><label>Text<input /></label><p>{t('Новое обращение')}</p></>;
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe('localization', () => {
  it('persists all three locales and retains form state on a change', async () => {
    const user = userEvent.setup();
    const view = render(<I18nProvider><Example /></I18nProvider>);
    expect(screen.getByText('Новое обращение')).toBeTruthy();
    await user.type(screen.getByLabelText('Text'), 'unchanged');
    await user.selectOptions(screen.getByLabelText('Language'), 'en');
    expect(screen.getByText(catalog.en['Новое обращение']!)).toBeTruthy();
    expect((screen.getByLabelText('Text') as HTMLInputElement).value).toBe('unchanged');
    expect(document.documentElement.lang).toBe('en');
    await user.selectOptions(screen.getByLabelText('Language'), 'kk');
    expect(screen.getByText(catalog.kk['Новое обращение']!)).toBeTruthy();
    expect(localStorage.getItem('employee-feedback-locale')).toBe('kk');
    view.unmount(); render(<I18nProvider><Example /></I18nProvider>);
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('kk');
  });
  it('has matching catalogs and locale-specific date formatting', () => {
    expect(Object.keys(catalog.en).sort()).toEqual(Object.keys(catalog.kk).sort());
    expect(Object.keys(catalog.en).sort()).toEqual(Object.keys(catalog.ru).sort());
    const value = '2026-11-10T10:00:00Z';
    expect(dateLabel(value, 'en')).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)));
    expect(dateLabel(value, 'kk')).toBe(new Intl.DateTimeFormat('kk-KZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)));
  });
});
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../src/app/session';
import QueuePage from '../src/pages/QueuePage';
import { ManagerActions } from '../src/features/ComplaintActions';
import { StatusBadge, type Complaint } from '../src/features/complaint';

function LanguageControl() {
  const { locale, setLocale } = useI18n();
  return <label>Language<select value={locale} onChange={event => setLocale(event.target.value as 'ru' | 'en' | 'kk')}><option value="ru">RU</option><option value="en">EN</option><option value="kk">KK</option></select></label>;
}

describe('localized queue and actions', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === '/reference-data') return Response.json({ categories: [], departments: [], assignees: [] });
      return Response.json({ items: [], total: url.searchParams.has('q') ? 0 : 1234, limit: 20, offset: 0 });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('translates an empty search and formats its count when the language changes', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/queue?q=missing']}><I18nProvider><SessionProvider><LanguageControl /><QueuePage /></SessionProvider></I18nProvider></MemoryRouter>);
    expect(await screen.findByText('По запросу «missing» обращений нет.')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Language'), 'en');
    expect(screen.getByText('No requests match “missing”.')).toBeTruthy();
    expect(screen.getByText(/1,234/)).toBeTruthy();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('missing');
  });
  it('translates manager actions and status while preserving typed text', async () => {
    const user = userEvent.setup();
    const item = { id: 'id-1', status: 'in_review', assignee: null, comments: [] } as unknown as Complaint;
    render(<I18nProvider><SessionProvider><LanguageControl /><StatusBadge status="in_review" /><ManagerActions item={item} onUpdated={() => {}} /></SessionProvider></I18nProvider>);
    await user.type(screen.getByLabelText('Комментарий или вопрос'), 'User text');
    await user.selectOptions(screen.getByLabelText('Language'), 'en');
    expect(screen.getByText(catalog.en['На рассмотрении']!)).toBeTruthy();
    expect(screen.getByRole('button', { name: catalog.en['Добавить комментарий']! })).toBeTruthy();
    expect((screen.getByLabelText(catalog.en['Комментарий или вопрос']!) as HTMLTextAreaElement).value).toBe('User text');
  });
});
