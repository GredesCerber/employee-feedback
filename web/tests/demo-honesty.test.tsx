import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { ABOUT_ROWS, DEMO_STEPS } from '../src/features/demo';

// #116 (идея #82): бейджи «Имитация», подсказки шагов демо, страница «О прототипе» (R12).
const repo = (path: string) => existsSync(resolve(path)) ? resolve(path) : resolve('..', path);
const read = (path: string) => readFileSync(repo(path), 'utf8');

beforeEach(() => {
  sessionStorage.clear(); // черновик формы подачи (#312 A2) не переходит между тестами
  try { localStorage.clear(); } catch { /* jsdom always has storage */ }
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json({ categories: [{ id: 'cross_department', name: 'Межотдельное взаимодействие', dueInDays: 7, assigneeId: null }], departments: [], assignees: [] });
    if (url.pathname === '/complaints') return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
    if (url.pathname === '/summary') return Response.json({ total: 0, byType: [], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: '2026-11-10T10:00:00Z' });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function open(path = '/') {
  const user = userEvent.setup();
  const view = render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  return { user, ...view };
}

describe('#116 «Имитация» badges', () => {
  it('marks the demo role selector as simulated sign-in', () => {
    open();
    const header = screen.getByRole('banner');
    const badge = within(header).getByText('Имитация');
    expect(badge.closest('.imitation-badge')?.textContent).toMatch(/не настоящий вход/);
  });

  it('marks the placeholder attachment as not a real file', async () => {
    open('/submit');
    const checkbox = await screen.findByLabelText(/Добавить тестовое вложение/);
    const badge = checkbox.closest('label')!.querySelector('.imitation-badge');
    expect(badge?.textContent).toMatch(/Имитация/);
    expect(badge?.textContent).toMatch(/не настоящий файл/);
  });
});

describe('#116 demo step hints', () => {
  it('follows the demo scenario in docs/tz-analysis.md word for word', () => {
    const table = read('docs/tz-analysis.md').split('## 2.')[0]!;
    const rows = table.split('\n').filter(line => /^\| [1-6] \|/.test(line)).map(line => line.split('|')[2]!.trim());
    expect(rows).toHaveLength(6);
    expect(DEMO_STEPS.map(step => step.action)).toEqual(rows);
  });

  it('shows «Шаг N из 6» with a link to the next step on every screen once enabled', async () => {
    const { user } = open('/submit');
    expect(screen.queryByText(/Шаг \d из 6/)).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Подсказки демо' }));
    const hint = await screen.findByRole('note', { name: 'Подсказка демо' });
    expect(hint.textContent).toMatch(/Шаг 1 из 6/);
    expect(within(hint).getByRole('link', { name: /Шаг 2/ }).getAttribute('href')).toBe('/my');

    await user.click(within(hint).getByRole('link', { name: /Шаг 2/ }));
    expect((await screen.findByRole('note', { name: 'Подсказка демо' })).textContent).toMatch(/Шаг 2 из 6/);

    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
    expect((await screen.findByRole('note', { name: 'Подсказка демо' })).textContent).toMatch(/Шаг 5 из 6/);
    await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'admin');
    const last = await screen.findByRole('note', { name: 'Подсказка демо' });
    expect(last.textContent).toMatch(/Шаг 6 из 6/);
    expect(within(last).getByRole('link', { name: /О прототипе/ })).toBeTruthy();
  });

  it('remembers the toggle across reloads', async () => {
    const first = open('/submit');
    await first.user.click(screen.getByRole('checkbox', { name: 'Подсказки демо' }));
    first.unmount();
    open('/submit');
    expect((screen.getByRole('checkbox', { name: 'Подсказки демо' }) as HTMLInputElement).checked).toBe(true);
    expect(await screen.findByRole('note', { name: 'Подсказка демо' })).toBeTruthy();
  });

  it('keeps working when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { user } = open('/submit');
    await user.click(screen.getByRole('checkbox', { name: 'Подсказки демо' }));
    expect(await screen.findByRole('note', { name: 'Подсказка демо' })).toBeTruthy();
  });
});

describe('#116 «О прототипе» page', () => {
  it('shows a real / simulated / planned table covering R1–R13 for every role', async () => {
    for (const role of ['employee', 'manager', 'admin'] as const) {
      const { user, unmount } = open('/');
      if (role !== 'employee') await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
      await user.click(screen.getByRole('link', { name: 'О прототипе' }));
      const table = await screen.findByRole('table', { name: 'Реализовано, имитация, план' });
      for (const header of ['Реализовано', 'Имитация', 'План']) expect(within(table).getByRole('columnheader', { name: header })).toBeTruthy();
      const text = table.textContent!;
      for (let n = 1; n <= 13; n += 1) expect(text).toContain(`R${n}`);
      unmount();
    }
  });

  it('matches web/concept/prototype-approach.md cell by cell (a divergence fails the test)', () => {
    const doc = read('web/concept/prototype-approach.md');
    const lines = doc.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Функция') && !line.startsWith('|---'));
    const fromDoc = ABOUT_ROWS.filter(row => row.source === 'prototype-approach');
    expect(fromDoc.length).toBeGreaterThanOrEqual(12);
    for (const row of fromDoc) {
      const line = lines.find(item => item.split('|')[1]!.trim() === row.feature);
      expect(line, `в prototype-approach.md нет строки «${row.feature}»`).toBeTruthy();
      const [, , , done, imitation, plan] = line!.split('|').map(cell => cell.trim());
      expect(row.done ?? '', row.feature).toBe(done);
      expect(row.imitation ?? '', row.feature).toBe(imitation);
      expect(row.plan ?? '', row.feature).toBe(plan);
    }
  });

  it('keeps the missing anonymous form flag separate from API progress and labels demo sign-in', () => {
    const access = read('api/concept/access.md');
    expect(access).toMatch(/Анонимная подача/);
    const anonymous = ABOUT_ROWS.find(row => row.source === 'access' && row.feature.startsWith('Анонимная подача'))!;
    expect(anonymous.plan).toMatch(/флажок.*форм/i);
    expect(JSON.stringify(anonymous)).not.toMatch(/контракт запрещает/);
    expect(anonymous.done).toBeUndefined();
    expect(access).toMatch(/имитация входа/i);
  });
});
