import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App';
import { catalog } from '../src/i18n';

const categories = [
  ['z', 'Zulu', 9], ['b', 'Bravo', 4], ['a', 'Alpha', 4], ['c', 'Charlie', 3],
  ['d', 'Delta', 2], ['e', 'Echo', 2], ['f', 'Foxtrot', 2], ['g', 'Golf', 2], ['h', 'Hotel', 2],
].map(([categoryId, categoryName, count]) => ({ categoryId, categoryName, count }));
const digest = { text: 'Недельный текст', highlights: ['Важное'], source: 'template',
  period: { from: '2026-11-04T12:00:00Z', to: '2026-11-11T12:00:00Z' }, generatedAt: '2026-11-11T12:00:00Z' };
let items = categories;
let digestRequests: string[];
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
beforeEach(() => {
  items = categories; digestRequests = []; localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/summary/digest') { digestRequests.push(url.search); return Response.json(digest); }
    if (url.pathname === '/analytics/trends') return Response.json({ generatedAt: digest.generatedAt, byDay: [], byWeek: [], byCategory: items,
      byDepartment: [], topThemes: [], overdue: [], totals: { total: 20, openCount: 20, closedCount: 0, overdueCount: 0, averageResolutionHours: null } });
    if (url.pathname === '/reference-data') return Response.json({ categories: [], assignees: [], departments: [{ id: 'engineering', name: 'Инженерный отдел' }] });
    return Response.json({ items: [], unreadCount: 0, total: 0 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function open(path = '/dashboard') {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), 'manager');
  await screen.findByRole('table', { name: 'Обращения по категориям' });
  return user;
}
function rows() { return within(screen.getByRole('table', { name: 'Обращения по категориям' })).getAllByRole('row').slice(1).map(row => within(row).getByRole('rowheader').textContent); }
function sectionButton(name: string) { return within(screen.getByRole('heading', { name, level: 2 })).getByRole('button', { name }); }

it('toggles both complete sections with native keyboard controls and linked state', async () => {
  const user = await open();
  await screen.findByText(digest.text);
  for (const [heading, content] of [['По категориям', 'Обращения по категориям'], ['Сводка за неделю', digest.text]]) {
    const button = sectionButton(heading!);
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(button.getAttribute('aria-controls')!);
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain(content);
    button.focus(); await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.hidden || !panel?.isConnected).toBe(true);
    await user.keyboard(' ');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)?.textContent).toContain(content);
  }
  expect(digestRequests).toHaveLength(1);
  expect(screen.getByText('Шаблон (без ИИ)')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Обновить сводку за неделю' }));
  await waitFor(() => expect(digestRequests).toHaveLength(2));
});

it('limits both rows and bars to eight, then expands and restores them', async () => {
  const user = await open();
  expect(rows()).toHaveLength(8);
  expect(screen.getByRole('img', { name: /Обращения по категориям/ }).querySelectorAll('[data-bar]')).toHaveLength(8);
  await user.click(screen.getByRole('button', { name: 'Показать все' }));
  expect(rows()).toHaveLength(9);
  expect(screen.getByRole('img', { name: /Обращения по категориям/ }).querySelectorAll('[data-bar]')).toHaveLength(9);
  await user.click(screen.getByRole('button', { name: 'Свернуть' }));
  expect(rows()).toHaveLength(8);
});

it('does not offer expansion for eight categories', async () => {
  items = categories.slice(0, 8);
  await open();
  expect(rows()).toHaveLength(8);
  expect(screen.queryByRole('button', { name: 'Показать все' })).toBeNull();
});

it('sorts by count with deterministic ties and by name while preserving URL filters', async () => {
  const user = await open('/dashboard?department=engineering&categorySort=count');
  expect(rows().slice(0, 3)).toEqual(['Zulu', 'Alpha', 'Bravo']);
  const sort = screen.getByLabelText('Сортировка категорий');
  await user.selectOptions(sort, 'name');
  expect(rows().slice(0, 3)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  expect(rows().at(-1)).toBe('Hotel');
  expect(screen.getByTestId('location').textContent).toContain('categorySort=name');
  expect(screen.getByTestId('location').textContent).toContain('department=engineering');
  await user.selectOptions(screen.getByLabelText('Подразделение'), '');
  expect(screen.getByTestId('location').textContent).toContain('categorySort=name');
  await user.selectOptions(sort, 'count');
  expect(rows().slice(0, 3)).toEqual(['Zulu', 'Alpha', 'Bravo']);
  expect(screen.getByTestId('location').textContent).toContain('categorySort=count');
});

it('restores alphabetical sorting from the initial URL', async () => {
  await open('/dashboard?categorySort=name');
  expect(rows().slice(0, 3)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  expect(rows().at(-1)).toBe('Hotel');
});

it.each(['en', 'kk'] as const)('translates the new category controls in %s', async locale => {
  const user = await open();
  await user.selectOptions(screen.getByLabelText('Language / Язык / Тіл'), locale);
  const sortLabel = catalog[locale]['Сортировка категорий'];
  const showAll = catalog[locale]['Показать все'];
  expect(sortLabel).toBeTruthy();
  expect(showAll).toBeTruthy();
  expect(sortLabel).not.toBe('Сортировка категорий');
  expect(showAll).not.toBe('Показать все');
  expect(screen.getByLabelText(sortLabel!)).toBeTruthy();
  expect(screen.getByRole('button', { name: showAll! })).toBeTruthy();
});
