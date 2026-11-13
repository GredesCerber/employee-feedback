// #415: общая защита от сети для тестов API. Подключается в `npm test` через `node --import`,
// поэтому действует на все тестовые файлы, а не только на те, что сами подменяют fetch.
// Внешние адреса запрещены: запрос падает с понятной ошибкой, в сеть он не уходит.
// Loopback (localhost, 127.x, ::1) разрешён: тесты поднимают локальные серверы.
// Подмена через t.mock.method(globalThis, 'fetch') по-прежнему работает и отменяет защиту для себя.
// ALLOW_TEST_NETWORK=1 отключает защиту целиком, для ручной интеграционной проверки.
import net from 'node:net';

if (process.env.ALLOW_TEST_NETWORK !== '1') {
  const isLoopback = host => {
    const h = String(host ?? '').toLowerCase().replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || h === '' || /^127\.\d+\.\d+\.\d+$/.test(h);
  };
  const blockedError = (host, via) => new Error(
    `Сетевой запрос запрещён в тестах API (${via} → ${host}). ` +
    'Подмените fetch в тесте (t.mock.method(globalThis, \'fetch\', …)) или задайте ALLOW_TEST_NETWORK=1 для интеграционной проверки.',
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    let host;
    try { host = new URL(raw).hostname; } catch { host = String(raw); }
    if (!isLoopback(host)) return Promise.reject(blockedError(host, 'fetch'));
    return originalFetch.call(this, input, init);
  };

  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const first = args[0];
    // Unix-сокет (path) локальный: пропускаем.
    if (first && typeof first === 'object') {
      if (first.path) return originalConnect.apply(this, args);
      if (!isLoopback(first.host ?? 'localhost')) throw blockedError(first.host, 'net');
    } else if (typeof first === 'number' || typeof first === 'string') {
      const host = typeof args[1] === 'string' ? args[1] : 'localhost';
      if (typeof first === 'string' && Number.isNaN(Number(first))) return originalConnect.apply(this, args);
      if (!isLoopback(host)) throw blockedError(host, 'net');
    }
    return originalConnect.apply(this, args);
  };
}
