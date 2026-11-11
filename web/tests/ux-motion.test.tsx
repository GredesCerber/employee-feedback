import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd().endsWith('web') ? '.' : 'web');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const shell = readFileSync(resolve(root, 'src/shell.css'), 'utf8');
const pages = readFileSync(resolve(root, 'src/pages.css'), 'utf8');

describe('theme and motion polish', () => {
  it('applies a saved explicit theme before the application loads', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('/src/main.tsx'));
    const apply = new Function('localStorage', 'document', script!);
    for (const value of ['light', 'dark', 'system', null]) {
      const document = { documentElement: { dataset: {} as Record<string, string> } };
      apply({ getItem: () => value }, document);
      expect(document.documentElement.dataset.theme).toBe(value === 'light' || value === 'dark' ? value : undefined);
    }
    expect(() => apply({ getItem: () => { throw new Error('unavailable'); } }, { documentElement: { dataset: {} } })).not.toThrow();
  });

  it('respects reduced motion and does not animate the loading spinner', () => {
    expect(shell).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/);
    expect(pages).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?\.spinner\s*\{\s*animation:\s*none/);
    expect(shell).not.toMatch(/transition:\s*all\b/);
  });
});
