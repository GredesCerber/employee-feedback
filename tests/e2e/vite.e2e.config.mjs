// Vite-конфиг для прогона e2e на нестандартном порту API (#301).
// web/vite.config.ts проксирует /api на порт 3000; здесь цель прокси берётся из E2E_API_PORT,
// чтобы параллельные прогоны в разных worktree не задевали чужие серверы. Продуктовый конфиг не меняется.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webRequire = createRequire(new URL('../../web/package.json', import.meta.url));
const { default: react } = await import(pathToFileURL(webRequire.resolve('@vitejs/plugin-react')).href);
const apiPort = process.env.E2E_API_PORT ?? '3000';

export default {
  root: fileURLToPath(new URL('../../web/', import.meta.url)),
  plugins: [react()],
  server: {
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } },
  },
};
