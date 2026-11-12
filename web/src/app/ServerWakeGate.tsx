import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { readStoredLocale } from '../i18n/locale';
import type { Locale } from '../i18n/locale';
import '../styles/tokens.css';
import './server-wake.css';

/** Повтор раз в 3 с; после 90 с без ответа — ошибка с «Повторить» (#351). */
export const RETRY_MS = 3000;
export const GIVE_UP_MS = 90000;
/** Быстрый ответ не мигает экраном ожидания: показываем его, если первый запрос висит дольше. */
const SHOW_AFTER_MS = 800;

const texts: Record<Locale, { waking: string; hint: string; failed: string; retry: string }> = {
  ru: {
    waking: 'Сервер просыпается, подождите до минуты',
    hint: 'Демо-стенд на бесплатном хостинге засыпает без посетителей. Страница откроется сама, как только сервер ответит.',
    failed: 'Сервер не отвечает больше 90 секунд. Проверьте подключение и повторите попытку.',
    retry: 'Повторить',
  },
  en: {
    waking: 'The server is waking up, please wait up to a minute',
    hint: 'The demo runs on free hosting that sleeps without visitors. The page will open by itself as soon as the server answers.',
    failed: 'The server has not answered for more than 90 seconds. Check your connection and try again.',
    retry: 'Retry',
  },
  kk: {
    waking: 'Сервер оянуда, бір минутқа дейін күтіңіз',
    hint: 'Демо-стенд тегін хостингте, келушілер болмаса ұйықтап қалады. Сервер жауап бергенде бет өзі ашылады.',
    failed: 'Сервер 90 секундтан артық жауап бермей тұр. Байланысты тексеріп, қайталап көріңіз.',
    retry: 'Қайталау',
  },
};

type Phase = 'checking' | 'waking' | 'ready' | 'failed';
type Props = { children: ReactNode; fetch?: typeof fetch; healthUrl?: string };

const defaultHealthUrl = () => `${import.meta.env.VITE_API_BASE_URL || '/api'}/health`;

/**
 * Холодный старт Render: пока API не отвечает на /health, вместо пустой страницы и ошибок
 * показываем понятное ожидание с индикатором и повторяем запрос каждые 3 секунды.
 */
export default function ServerWakeGate({ children, fetch: fetcher, healthUrl }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [run, setRun] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const url = healthUrl ?? defaultHealthUrl();

  useEffect(() => {
    let active = true;
    const started = Date.now();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const showTimer = setTimeout(() => { if (active) setPhase(current => current === 'checking' ? 'waking' : current); }, SHOW_AFTER_MS);

    const attempt = async () => {
      const attemptStarted = Date.now();
      controller = new AbortController();
      // Спящий сервер держит соединение открытым: обрываем попытку, чтобы повторять в своём ритме.
      const abortTimer = setTimeout(() => controller?.abort(), RETRY_MS);
      let up = false;
      try {
        const response = await (fetchRef.current ?? window.fetch)(url, { cache: 'no-store', signal: controller.signal });
        up = response.ok;
      } catch { /* сеть или обрыв по таймауту: сервер ещё спит */ }
      clearTimeout(abortTimer);
      if (!active) return;
      if (up) { setPhase('ready'); return; }
      if (Date.now() - started >= GIVE_UP_MS) { setPhase('failed'); return; }
      setPhase('waking');
      retryTimer = setTimeout(attempt, Math.max(0, RETRY_MS - (Date.now() - attemptStarted)));
    };
    void attempt();
    return () => {
      active = false;
      clearTimeout(showTimer);
      clearTimeout(retryTimer);
      controller?.abort();
    };
  }, [url, run]);

  const retry = useCallback(() => { setPhase('checking'); setRun(value => value + 1); }, []);

  if (phase === 'ready') return <>{children}</>;
  if (phase === 'checking') return null;
  const text = texts[readStoredLocale()];
  if (phase === 'failed') {
    return (
      <main className="server-wake">
        <div className="server-wake__panel" role="alert">
          <p className="server-wake__title">{text.failed}</p>
          <button type="button" className="server-wake__retry" onClick={retry}>{text.retry}</button>
        </div>
      </main>
    );
  }
  return (
    <main className="server-wake">
      <div className="server-wake__panel" role="status" aria-live="polite">
        <span className="server-wake__spinner" aria-hidden="true" />
        <p className="server-wake__title">{text.waking}</p>
        <p className="server-wake__hint">{text.hint}</p>
      </div>
    </main>
  );
}
