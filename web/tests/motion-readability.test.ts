import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #275 (UX-05/06/07): статические проверки стилей. Тесты читают CSS-файлы веб-клиента.
const srcDir = join(__dirname, '..', 'src');
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}
const css = cssFiles(srcDir).map(path => readFileSync(path, 'utf8')).join('\n');
const shell = readFileSync(join(srcDir, 'shell.css'), 'utf8');

describe('#275 motion and readability', () => {
  it('never uses transition: all', () => {
    expect(css).not.toMatch(/transition:\s*all\b/);
  });

  it('never applies will-change to the page root or to every element', () => {
    expect(css).not.toMatch(/(^|[\s,}])(\*|html|body)\s*\{[^}]*will-change/);
  });

  it('turns decorative motion off under prefers-reduced-motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(shell)?.[1] ?? '';
    expect(block).toMatch(/transition-duration:\s*0\.01ms !important/);
    expect(block).toMatch(/animation-duration:\s*0\.01ms !important/);
    expect(block).toMatch(/button:active:not\(:disabled\)\s*\{\s*transform:\s*none/);
  });

  it('keeps a visible focus ring for every field', () => {
    expect(shell).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--color-focus\)/);
  });

  it('marks invalid fields and disabled fields with distinct styles', () => {
    expect(shell).toMatch(/\[aria-invalid="true"\]\s*\{[^}]*border-color:\s*var\(--color-danger\)/);
    expect(shell).toMatch(/:disabled\s*\{[^}]*background:\s*var\(--color-surface-muted\)/);
  });

  it('limits press feedback to a short transform on buttons', () => {
    expect(shell).toMatch(/button:active:not\(:disabled\)\s*\{\s*transform:\s*translateY\(1px\)/);
  });
});
