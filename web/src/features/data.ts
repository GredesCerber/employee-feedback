import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Не удалось получить ответ сервера. Повторите попытку.';
}

export function requireData<T>(data: T | undefined): T {
  if (data === undefined) throw new Error('Expected API response data');
  return data;
}

export function useResource<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    load().then(data => { if (active) setState({ data, loading: false }); })
      .catch(error => { if (active) setState({ error: errorMessage(error), loading: false }); });
    return () => { active = false; };
  }, [load, attempt]);
  return { ...state, reload: () => setAttempt(value => value + 1) };
}
