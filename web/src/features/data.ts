import { useEffect, useState } from 'react';
import { ApiError, tooManyRequests } from '../api/client';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Не удалось получить ответ сервера. Повторите попытку.';
}

/** Сколько секунд ждать после 429, иначе undefined. */
export function retryAfterOf(error: unknown): number | undefined {
  return error instanceof ApiError && error.status === 429 ? error.retryAfter ?? 5 : undefined;
}

export function requireData<T>(data: T | undefined): T {
  if (data === undefined) throw new Error('Expected API response data');
  return data;
}

export function useResource<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data?: T; error?: string; retryAfter?: number; loading: boolean }>({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    load().then(data => { if (active) setState({ data, loading: false }); })
      .catch(error => { if (active) setState({ error: errorMessage(error), retryAfter: retryAfterOf(error), loading: false }); });
    return () => { active = false; };
  }, [load, attempt]);
  return { ...state, reload: () => setAttempt(value => value + 1) };
}

/** Обратный отсчёт блокировки после 429. `start(n)` блокирует на n секунд. */
export function useCooldown(initialSeconds = 0) {
  const [until, setUntil] = useState(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === 0) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [until]);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return {
    seconds,
    active: seconds > 0,
    message: seconds > 0 ? tooManyRequests(seconds) : '',
    start(value: number) { const current = Date.now(); setNow(current); setUntil(current + value * 1000); },
  };
}
