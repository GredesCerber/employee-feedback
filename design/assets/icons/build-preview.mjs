// Собирает preview.html из SVG-файлов этой папки: node design/assets/icons/build-preview.mjs
// Иконки встраиваются inline, чтобы currentColor работал и при открытии файла с диска (file://).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
const icons = readdirSync(dir).filter((name) => name.endsWith('.svg')).sort();

const card = (file) => {
  const svg = readFileSync(`${dir}${file}`, 'utf8').trim();
  const title = svg.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] ?? file;
  return `      <figure>${svg}<figcaption>${title}<code>${file}</code></figcaption></figure>`;
};
const grid = icons.map(card).join('\n');

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Иконки: предпросмотр</title>
  <style>
    body { margin: 0; font: 14px/1.4 system-ui, sans-serif; }
    section { padding: 24px 16px; }
    .light { background: #ffffff; color: #1f2933; }
    .dark { background: #111827; color: #e5e7eb; }
    h2 { margin: 0 0 16px; font-size: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    figure { margin: 0; padding: 12px; border: 1px solid currentColor; border-radius: 8px; display: grid; justify-items: center; gap: 8px; text-align: center; }
    figure svg { width: 32px; height: 32px; }
    figcaption { display: grid; gap: 2px; }
    code { font-size: 11px; opacity: .75; }
  </style>
</head>
<body>
  <!-- Файл сгенерирован build-preview.mjs, правьте SVG и перезапускайте скрипт. -->
  <section class="light">
    <h2>Светлая тема</h2>
    <div class="grid">
${grid}
    </div>
  </section>
  <section class="dark">
    <h2>Тёмная тема</h2>
    <div class="grid">
${grid}
    </div>
  </section>
</body>
</html>
`;

writeFileSync(`${dir}preview.html`, html);
console.log(`preview.html: ${icons.length} иконок`);
