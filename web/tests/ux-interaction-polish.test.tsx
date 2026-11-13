import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

// #312: единые состояния кнопок, подсветка текущего раздела, анимации только без prefers-reduced-motion.
const srcDir = join(__dirname, '..', 'src');
const interaction = readFileSync(join(srcDir, 'styles/interaction.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const shell = readFileSync(join(srcDir, 'shell.css'), 'utf8');
const app = readFileSync(join(srcDir, 'App.tsx'), 'utf8');

/** Тело первого блока @media с данным условием (по балансу скобок). */
function mediaBlock(css: string, condition: string) {
  const start = css.indexOf(`@media (${condition})`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  return '';
}

afterEach(cleanup);

describe('#312 interaction polish: motion', () => {
  const motion = mediaBlock(interaction, 'prefers-reduced-motion: no-preference');
  const outside = interaction.replace(motion, '');

  it('keeps every animation, transition and transform inside the no-preference block', () => {
    expect(motion).toMatch(/animation:/);
    expect(outside).not.toMatch(/\banimation:|\btransition:|\btransform:/);
  });

  it('keeps demo hints and removes the separate animation switch', () => {
    render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
    expect(screen.getByRole('checkbox', { name: 'Подсказки демо' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Анимации' })).toBeNull();
  });

  it('is loaded after the base styles so that its states win', () => {
    expect(app.indexOf("'./styles/interaction.css'")).toBeGreaterThan(app.indexOf("'./pages.css'"));
    expect(mediaBlock(shell, 'prefers-reduced-motion: reduce')).toMatch(/animation-duration:\s*0\.01ms !important/);
  });
});

describe('#312 interaction polish: states', () => {
  it('defines hover, pressed, focus, disabled and busy states for buttons', () => {
    expect(interaction).toMatch(/button:where\(:hover:not\(:disabled\)/);
    expect(interaction).toMatch(/button:where\(:active:not\(:disabled\)/);
    expect(interaction).toMatch(/:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--color-focus-halo\)/);
    expect(interaction).toMatch(/button:disabled[^{]*\{[^}]*cursor:\s*not-allowed/);
    expect(interaction).toMatch(/button\[aria-busy="true"\]::before/);
  });

  it('makes primary, secondary and danger buttons visually different', () => {
    expect(interaction).toMatch(/\.danger-button\s*\{[^}]*color:\s*var\(--color-danger\)[^}]*background:\s*var\(--color-danger-bg\)/);
    expect(interaction).toMatch(/\.primary-button:where\(:hover[^{]*\{[^}]*var\(--color-primary-hover\)/);
  });

  it('highlights the current navigation item through aria-current', () => {
    expect(shell).toMatch(/\.workspace-sidebar nav a\[aria-current="page"\]\s*\{[^}]*background:\s*var\(--color-primary\)/);
  });

  it('keeps side-menu styles out of in-page navigation (dark-theme «Подать обращение» bar)', () => {
    // Регрессия: «.workspace nav a» перекрашивал быстрые действия в «Моих обращениях»: тёмный текст на тёмном фоне.
    expect(shell).not.toMatch(/\.workspace nav\b/);
    expect(interaction).not.toMatch(/\.workspace nav\b/);
  });
});

describe('#312 interaction polish: navigation', () => {
  const menu = () => within(screen.getByRole('navigation', { name: 'Основное меню' }));

  it('marks only the current section with aria-current="page"', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/my']}><App /></MemoryRouter>);
    expect(menu().getByRole('link', { name: 'Мои обращения' }).getAttribute('aria-current')).toBe('page');
    expect(menu().getByRole('link', { name: 'Новое обращение' }).getAttribute('aria-current')).toBeNull();
    await user.click(menu().getByRole('link', { name: 'Новое обращение' }));
    expect(menu().getByRole('link', { name: 'Новое обращение' }).getAttribute('aria-current')).toBe('page');
    expect(menu().getByRole('link', { name: 'Мои обращения' }).getAttribute('aria-current')).toBeNull();
  });

  it('uses the danger style for the destructive demo reset only', () => {
    const summaryPage = readFileSync(join(srcDir, 'pages/SummaryPage.tsx'), 'utf8');
    expect(summaryPage.match(/className="danger-button"/g)).toHaveLength(2);
    expect(summaryPage).toMatch(/className="danger-button"[^\n]{0,80}\{t\("Сбросить демо"\)\}/);
  });
});
