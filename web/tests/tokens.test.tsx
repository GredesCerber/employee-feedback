import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

// #106: дизайн-токены, тёмная тема с памятью, цвета только в tokens.css, контраст по WCAG.
const src = existsSync(resolve('src/styles')) ? resolve('src') : resolve('web/src');
const tokensCss = readFileSync(join(src, 'styles/tokens.css'), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const STATUSES = ['new', 'in_review', 'in_progress', 'awaiting_clarification', 'implemented', 'rejected', 'closed'];

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? cssFiles(full) : name.endsWith('.css') ? [full] : [];
  });
}

/** Переменные из блока с данным селектором (первое вхождение). */
function block(selector: string): Record<string, string> {
  const css = stripComments(tokensCss);
  const start = css.indexOf(`${selector} {`);
  expect(start, `в tokens.css нет блока ${selector}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1]!, match[2]!.trim()]));
}
const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };
const systemDark = { ...light, ...block(':root:not([data-theme="light"])') };

function luminance(hex: string) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map(c => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const PAIRS: [string, string][] = [
  ['--color-text', '--color-bg'], ['--color-text', '--color-surface'], ['--color-text', '--color-surface-muted'], ['--color-text', '--color-surface-subtle'],
  ['--color-text-strong', '--color-surface'], ['--color-text-muted', '--color-surface'], ['--color-text-muted', '--color-bg'], ['--color-text-muted', '--color-surface-muted'],
  ['--color-primary', '--color-surface'], ['--color-primary', '--color-surface-muted'], ['--color-on-primary', '--color-primary'],
  ['--color-notice-text', '--color-notice-bg'], ['--color-text', '--color-hint-bg'],
  ['--color-danger', '--color-surface'], ['--color-danger', '--color-danger-bg'], ['--color-text', '--color-danger-bg'],
  ['--color-warning-text', '--color-warning-bg'], ['--color-text', '--color-chart-track'],
  ...STATUSES.map(status => [`--status-${status}-fg`, `--status-${status}-bg`] as [string, string]),
];

describe('#106 tokens.css', () => {
  it('defines palette, 7 status colours, spacing, radii, typography and shadows', () => {
    for (const status of STATUSES) {
      expect(light[`--status-${status}-bg`], status).toMatch(/^#/);
      expect(light[`--status-${status}-fg`], status).toMatch(/^#/);
    }
    for (const prefix of ['--color-', '--space-', '--radius-', '--font-', '--shadow-']) {
      expect(Object.keys(light).some(key => key.startsWith(prefix)), prefix).toBe(true);
    }
  });

  it('keeps colours only in tokens.css and uses only defined tokens elsewhere', () => {
    const files = cssFiles(src).filter(file => !file.endsWith('tokens.css'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const css = stripComments(readFileSync(file, 'utf8'));
      const colours = css.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(|(?<![\w-])(?:white|black)(?![\w-])/g);
      expect(colours, relative(src, file)).toBeNull();
      for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) expect(light[name!], `${relative(src, file)}: ${name}`).toBeDefined();
    }
  });

  for (const [theme, values] of [['светлая', light], ['тёмная', dark], ['тёмная системная', systemDark]] as const) {
    it(`${theme} тема: контраст текста ≥ 4.5:1 по WCAG`, () => {
      for (const [fg, bg] of PAIRS) {
        const ratio = contrast(values[fg]!, values[bg]!);
        expect(ratio, `${fg} на ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('dark set defined for both explicit choice and prefers-color-scheme', () => {
    expect(tokensCss).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(block(':root[data-theme="dark"]')).toEqual(block(':root:not([data-theme="light"])'));
  });
});

describe('#106 theme switcher', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    document.documentElement.removeAttribute('data-theme');
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [], total: 0, limit: 20, offset: 0 })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); document.documentElement.removeAttribute('data-theme'); });
  const open = () => { const user = userEvent.setup(); const view = render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>); return { user, ...view }; };

  it('follows the system by default and applies the chosen dark theme', async () => {
    const { user } = open();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    await user.selectOptions(screen.getByLabelText('Тема'), 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await user.selectOptions(screen.getByLabelText('Тема'), 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('remembers the choice in localStorage across reloads', async () => {
    const first = open();
    await first.user.selectOptions(screen.getByLabelText('Тема'), 'dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    first.unmount(); document.documentElement.removeAttribute('data-theme');
    open();
    expect((screen.getByLabelText('Тема') as HTMLSelectElement).value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('works when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { user } = open();
    await user.selectOptions(screen.getByLabelText('Тема'), 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
