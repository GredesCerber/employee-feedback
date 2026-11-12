// Сквозной тест демо-пути (#57). Подробности запуска — в README.md рядом.
// По умолчанию Playwright сам поднимает API (порт 3000) и фронтенд Vite (порт 5173).
// E2E_BASE_URL=http://localhost:8080 — прогон против уже запущенного стенда (например, docker compose),
// тогда серверы не запускаются.
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const external = process.env.E2E_BASE_URL;
const ci = Boolean(process.env.CI);
// E2E_API_PORT / E2E_WEB_PORT — свободные порты для параллельных прогонов (#301). По умолчанию 3000 и 5173.
const apiPort = process.env.E2E_API_PORT ?? '3000';
const webPort = process.env.E2E_WEB_PORT ?? '5173';
const customApi = apiPort !== '3000';
// Трейс и скриншот выключены по умолчанию (#133); `playwright test --trace on` или `npm run e2e:artifacts`
// включает оба: при падении в test-results/ остаются trace.zip и скриншот (воркеры наследуют env).
const args = process.argv;
if (args.includes('--trace=on') || args.some((arg, i) => arg === '--trace' && args[i + 1] === 'on')) process.env.E2E_TRACE = 'on';

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
  outputDir: 'test-results',
  use: {
    baseURL: external ?? `http://127.0.0.1:${webPort}`,
    locale: 'ru-RU',
    timezoneId: 'Asia/Omsk',
    actionTimeout: 15_000,
    trace: 'off',
    screenshot: process.env.E2E_TRACE === 'on' ? 'only-on-failure' : 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: external ? undefined : [
    {
      name: 'api',
      command: 'npm --prefix api run build && npm --prefix api start',
      cwd: root,
      url: `http://127.0.0.1:${apiPort}/health`,
      // Без ключа Anthropic: e2e никогда не делает платных вызовов LLM (#301).
      env: { HOST: '127.0.0.1', PORT: apiPort, ANTHROPIC_API_KEY: '' },
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      name: 'web',
      command: `npm --prefix web run dev -- --port ${webPort} --strictPort${customApi ? ' --config ../tests/e2e/vite.e2e.config.mjs' : ''}`,
      cwd: root,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
