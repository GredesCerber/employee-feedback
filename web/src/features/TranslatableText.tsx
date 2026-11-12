import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../app/session';
import { useI18n, type Locale } from '../i18n';
import { requireData, retryAfterOf, useCooldown } from './data';
import './translation.css';

export type TranslatableField = 'description' | 'proposedSolution' | 'comment' | 'decision' | 'actions';
export type TranslatableTextProps = { complaintId: string; field: TranslatableField; commentId?: string; text: string };
const labels = {
  ru: { language: 'Язык перевода', translate: 'Перевести', loading: 'Переводим…', error: 'Перевод сейчас недоступен. Попробуйте ещё раз.', retry: 'Повторить', result: 'Перевод', hide: 'Скрыть перевод' },
  en: { language: 'Translation language', translate: 'Translate', loading: 'Translating…', error: 'Translation is unavailable. Please try again.', retry: 'Retry', result: 'Translation', hide: 'Hide translation' },
  kk: { language: 'Аударма тілі', translate: 'Аудару', loading: 'Аударылуда…', error: 'Аударма қазір қолжетімсіз. Қайталап көріңіз.', retry: 'Қайталау', result: 'Аударма', hide: 'Аударманы жасыру' },
};

export function TranslatableText(props: TranslatableTextProps) {
  const { locale } = useI18n();
  const { role } = useSession();
  return <TranslationPanel key={JSON.stringify([props.complaintId, props.field, props.commentId, props.text, locale, role])} {...props} locale={locale} />;
}
function TranslationPanel({ complaintId, field, commentId, text, locale }: TranslatableTextProps & { locale: Locale }) {
  const { api } = useSession();
  const t = labels[locale];
  const id = useId();
  const [target, setTarget] = useState<Locale>(locale);
  const [result, setResult] = useState<string>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();
  const request = useRef<{ controller: AbortController; generation: number } | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; request.current?.controller.abort(); }, [api]);
  function reset(next: Locale) {
    generation.current += 1;
    request.current?.controller.abort();
    request.current = null;
    setTarget(next); setBusy(false); setError(false); setResult(undefined);
  }
  async function translate() {
    if (busy || cooldown.active) return;
    const controller = new AbortController();
    const current = ++generation.current;
    request.current = { controller, generation: current };
    setBusy(true); setError(false); setResult(undefined);
    try {
      const response = await api.POST('/complaints/{complaintId}/translations', {
        params: { path: { complaintId } }, body: { field, targetLocale: target, ...(commentId ? { commentId } : {}) }, signal: controller.signal,
      });
      const data = requireData(response.data);
      if (generation.current === current) setResult(data.translatedText);
    } catch (cause) {
      if (generation.current !== current) return;
      const seconds = retryAfterOf(cause);
      if (seconds) cooldown.start(seconds);
      setError(true);
    } finally {
      if (generation.current === current) { request.current = null; setBusy(false); }
    }
  }
  return <div className="translation">
    <p className="preserve-lines">{text}</p>
    <div className="translation-controls">
      <label htmlFor={id}>{t.language}</label>
      <select id={id} value={target} onChange={event => reset(event.target.value as Locale)}><option value="ru">RU</option><option value="en">EN</option><option value="kk">KK</option></select>
      <button type="button" disabled={busy || cooldown.active} aria-busy={busy} onClick={() => void translate()}>{busy ? t.loading : error ? t.retry : t.translate}</button>
    </div>
    {busy && <p role="status">{t.loading}</p>}
    {error && <p role="alert">{cooldown.active ? cooldown.message : t.error}</p>}
    {result !== undefined && <div className="translation-result"><strong>{t.result} ({target.toUpperCase()})</strong><p className="preserve-lines">{result}</p><button type="button" onClick={() => setResult(undefined)}>{t.hide}</button></div>}
  </div>;
}
