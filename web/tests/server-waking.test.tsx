import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ServerWakeGate from '../src/app/ServerWakeGate';

// #351: бесплатный Render засыпает. Пока API не отвечает, показываем «Сервер просыпается»
// с повтором каждые 3 с; ответил — экран исчезает сам; дольше 90 с — ошибка с «Повторить».
const WAKING = 'Сервер просыпается, подождите до минуты';
const ok = () => Promise.resolve(new Response(JSON.stringify({ status: 'ok', version: '1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const asleep = () => Promise.reject(new TypeError('Failed to fetch'));
const proxy503 = () => Promise.resolve(new Response('Service Unavailable', { status: 503 }));

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
function mount(fetcher: ReturnType<typeof vi.fn>) {
  return render(<ServerWakeGate fetch={fetcher as unknown as typeof fetch} healthUrl="/api/health"><p>Приложение</p></ServerWakeGate>);
}

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('#351 server waking screen', () => {
  it('shows the app right away when the API answers at start, without the waking screen', async () => {
    const fetcher = vi.fn(ok);
    mount(fetcher);
    await flush();
    expect(screen.getByText('Приложение')).toBeTruthy();
    expect(screen.queryByText(WAKING)).toBeNull();
    expect(fetcher).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('Given the API does not answer at start, shows the waking message with an indicator and retries every 3 seconds', async () => {
    const fetcher = vi.fn(asleep);
    mount(fetcher);
    await flush();
    expect(screen.getByText(WAKING)).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Приложение')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await advance(2999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await advance(3000);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('treats a proxy 5xx while the server boots as still waking', async () => {
    const fetcher = vi.fn(proxy503);
    mount(fetcher);
    await flush();
    expect(screen.getByText(WAKING)).toBeTruthy();
  });

  it('Given the API answered, the screen disappears by itself', async () => {
    const fetcher = vi.fn(asleep).mockImplementationOnce(asleep).mockImplementationOnce(asleep).mockImplementation(ok);
    mount(fetcher);
    await flush();
    expect(screen.getByText(WAKING)).toBeTruthy();
    await advance(3000);
    expect(screen.getByText(WAKING)).toBeTruthy();
    await advance(3000);
    expect(screen.queryByText(WAKING)).toBeNull();
    expect(screen.getByText('Приложение')).toBeTruthy();
    const calls = fetcher.mock.calls.length;
    await advance(30000);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it('Given the API is unavailable for more than 90 seconds, shows a clear error with a Retry button that starts over', async () => {
    const fetcher = vi.fn(asleep);
    mount(fetcher);
    await flush();
    await advance(89000);
    expect(screen.getByText(WAKING)).toBeTruthy();
    await advance(3000);
    expect(screen.queryByText(WAKING)).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Сервер не отвечает');
    const calls = fetcher.mock.calls.length;
    await advance(30000);
    expect(fetcher).toHaveBeenCalledTimes(calls);

    fetcher.mockImplementation(ok);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(calls + 1);
    expect(screen.getByText('Приложение')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
