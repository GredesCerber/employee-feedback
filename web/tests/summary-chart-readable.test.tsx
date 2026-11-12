import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

// #197: подписи диаграмм сводки читаются (≥ 14 px на экране) на 1280 px и на 360 px, без горизонтальной прокрутки.
const src = existsSync(resolve('src/pages')) ? resolve('src') : resolve('web/src');
const css = readFileSync(resolve(src, 'pages/summary.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const summary = {
  total: 54, byType: [{ type: 'problem', count: 43 }, { type: 'suggestion', count: 10 }, { type: 'praise', count: 1 }],
  closedCount: 38, closedShare: 0.7, averageFirstResponseHours: 0.3, respondedCount: 49,
  recurringTopics: [
    { categoryId: 'cross_department', categoryName: 'Межотдельное взаимодействие', count: 18 },
    { categoryId: 'no_rule_demo', categoryName: 'Категория без ответственного (демо)', count: 17 },
    { categoryId: 'training', categoryName: 'Обучение', count: 2 },
  ],
  generatedAt: '2026-11-10T10:00:00Z',
};

/** Подменяет ResizeObserver: контейнер диаграммы получает заданную ширину, как в браузере. */
function containerWidth(width: number) {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => new URL(request.url).pathname === '/summary'
    ? Response.json(summary) : Response.json({ items: [], total: 0, limit: 20, offset: 0 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function charts() {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
  await screen.findByRole('heading', { name: 'Сводка', level: 1 });
  // Столбчатые диаграммы; кольцо по типам проверяется в summary-charts.test.tsx.
  return (await screen.findAllByRole('img')).filter(element => element.classList.contains('bar-chart'));
}

/** Масштаб: сколько экранных пикселей на одну единицу viewBox. */
function scale(svg: Element) {
  const [, , vbWidth] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  return Number(svg.getAttribute('width')) / vbWidth!;
}

describe('#197 readable summary charts', () => {
  it('chart text is 14px in CSS and never scaled down (1 viewBox unit = 1 screen px)', async () => {
    const font = /\.bar-chart text\s*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px/.exec(css);
    expect(Number(font![1])).toBeGreaterThanOrEqual(14);
    containerWidth(1100);
    const svgs = await charts();
    expect(svgs).toHaveLength(1);
    for (const svg of svgs) {
      expect(scale(svg)).toBe(1);
      expect(Number(svg.getAttribute('width'))).toBe(1100);
      const [, , , vbHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      expect(Number(svg.getAttribute('height'))).toBe(vbHeight);
    }
  });

  it('on a wide container long labels fit inside the chart (no text before x=0)', async () => {
    containerWidth(1100);
    const [topics] = await charts();
    const label = within(topics as unknown as HTMLElement).getByText('Категория без ответственного (демо)');
    const x = Number(label.getAttribute('x'));
    expect(label.getAttribute('text-anchor')).toBe('end');
    expect(x).toBeGreaterThanOrEqual('Категория без ответственного (демо)'.length * 7.5);
  });

  it('at 360 px (≈300 px container) labels move above bars, chart fits the width, nothing overlaps', async () => {
    containerWidth(300);
    const svgs = await charts();
    for (const svg of svgs) {
      expect(Number(svg.getAttribute('width'))).toBe(300);
      expect(scale(svg)).toBe(1);
      for (const group of svg.querySelectorAll('[data-bar]')) {
        const label = group.querySelector('.bar-label')!;
        const bar = group.querySelector('.bar-fill')!;
        const track = group.querySelector('.bar-track')!;
        expect(Number(track.getAttribute('x')) + Number(track.getAttribute('width'))).toBeLessThanOrEqual(300);
        if (label.getAttribute('text-anchor') === 'start') {
          // Подпись над столбцом.
          expect(Number(label.getAttribute('y'))).toBeLessThan(Number(bar.getAttribute('y')));
        } else {
          // Подпись слева: целиком помещается до начала столбца.
          const x = Number(label.getAttribute('x'));
          expect(x).toBeLessThan(Number(track.getAttribute('x')));
          expect(x).toBeGreaterThanOrEqual(label.textContent!.length * 7.5);
        }
      }
    }
    // Длинные названия категорий на узком экране переносятся над столбцами.
    expect(svgs[0]!.querySelector('[data-bar="Категория без ответственного (демо)"] .bar-label')!.getAttribute('text-anchor')).toBe('start');
  });

  it('the chart never sets a percentage width or a horizontal scroller', () => {
    const chart = /\.bar-chart\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(chart).not.toMatch(/(?<![-\w])width:\s*\d+%/);
    expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });
});
