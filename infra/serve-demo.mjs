import { createServer, request as proxyRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function createDemoServer({ directory, apiPort }) {
  const root = resolve(directory);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
  return createServer(async (req, res) => {
    if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
      const proxy = proxyRequest({ hostname: '127.0.0.1', port: apiPort, path: req.url.slice(4) || '/', method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } }, upstream => {
        res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
      });
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: 'API_UNAVAILABLE', message: 'API демо недоступен.' })); });
      req.on('aborted', () => proxy.destroy());
      req.pipe(proxy); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      let body;
      try { body = await readFile(file); }
      catch (error) {
        if (!['ENOENT', 'EISDIR', 'EPERM'].includes(error.code)) throw error;
        if (extname(file)) { res.writeHead(404); res.end(); return; }
        file = resolve(root, 'index.html'); body = await readFile(file);
      }
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(400); res.end('Invalid request or missing web build'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const web = createDemoServer({ directory: fileURLToPath(new URL('../web/dist/', import.meta.url)), apiPort: Number(process.env.DEMO_API_PORT) });
  web.listen(Number(process.env.DEMO_WEB_PORT), '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => web.close());
}
