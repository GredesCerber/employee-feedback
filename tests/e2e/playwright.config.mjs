// Сквозной тест демо-пути (#57). Подробности запуска — в README.md рядом.
// По умолчанию Playwright сам поднимает API (порт 3000) и фронтенд Vite (порт 5173).
// E2E_BASE_URL=http://localhost:8080 — прогон против уже запущенного стенда (например, docker compose),
// тогда серверы не запускаются.
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const external = process.env.E2E_BASE_URL;
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: ci,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: external ?? 'http://127.0.0.1:5173',
    locale: 'ru-RU',
    timezoneId: 'Asia/Omsk',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: external ? undefined : [
    {
      name: 'api',
      command: 'npm --prefix api run build && npm --prefix api start',
      cwd: root,
      url: 'http://127.0.0.1:3000/health',
      env: { HOST: '127.0.0.1', PORT: '3000' },
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      name: 'web',
      command: 'npm --prefix web run dev -- --port 5173 --strictPort',
      cwd: root,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
