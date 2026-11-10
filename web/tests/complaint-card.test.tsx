import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Complaint } from '../src/features/complaint';
import { commentKindLabels, routingReasonLabels } from '../src/features/complaintMeta';

const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const reference = contract.components.schemas.ReferenceData.examples[0];
let current: Complaint;

beforeEach(() => {
  current = { ...structuredClone(example), status: 'in_review', priority: 'high' };
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/reference-data') return Response.json(reference);
    if (url.pathname === '/complaints') return Response.json({ items: [current], total: 1, limit: 20, offset: 0 });
    return Response.json(current);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function openCard(role: 'employee' | 'manager') {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  await user.selectOptions(screen.getByLabelText('Демонстрационная роль'), role);
  await user.click(await screen.findByRole('link', { name: current.number }));
  await screen.findByRole('heading', { name: `Обращение ${current.number}` });
}
function metadata(term: string) {
  const dt = screen.getAllByRole('term').find(node => node.textContent === term);
  if (!dt) throw new Error(`нет поля «${term}»`);
  return dt.nextElementSibling?.textContent ?? '';
}

describe('карточка обращения: метаданные (#201)', () => {
  it.each(['employee', 'manager'] as const)('показывает названия категории и подразделения, приоритет и автора (%s)', async role => {
    await openCard(role);
    expect(await screen.findByText('Межотдельное взаимодействие')).toBeTruthy();
    expect(metadata('Категория')).toBe('Межотдельное взаимодействие');
    expect(metadata('Подразделение')).toBe('Закупки');
    expect(metadata('Приоритет')).toBe('Высокий');
    expect(metadata('Автор')).toBe('Сотрудник закупок');
    expect(screen.queryByText('cross_department')).toBeNull();
    expect(screen.queryByText('procurement')).toBeNull();
  });

  it('показывает анонимного автора как «Аноним»', async () => {
    current.anonymous = true;
    current.author = { name: 'Аноним' };
    await openCard('manager');
    expect(metadata('Автор')).toBe('Аноним');
  });

  it.each([
    ['category_rule', 'по правилу категории'],
    ['no_rule', 'запасная очередь'],
    ['manual_assignment', 'вручную'],
  ] as const)('подписывает routing.reason=%s по-русски', async (reason, fragment) => {
    current.routing = { queue: reason === 'no_rule' ? 'unassigned' : 'assigned', reason };
    if (reason === 'no_rule') current.assignee = null;
    await openCard('manager');
    expect(metadata('Как назначен')).toContain(fragment);
    expect(metadata('Как назначен')).toBe(routingReasonLabels[reason]);
  });

  it('поясняет, что обращение без ответственного лежит в запасной очереди', async () => {
    current.assignee = null;
    current.routing = { queue: 'unassigned', reason: 'no_rule' };
    await openCard('employee');
    expect(metadata('Ответственный')).toBe('Ожидает назначения');
    expect(screen.getByText(/в запасной очереди: для категории не настроено правило/)).toBeTruthy();
  });

  it('не показывает пояснение про запасную очередь, если ответственный есть', async () => {
    await openCard('employee');
    expect(screen.queryByText(/в запасной очереди/)).toBeNull();
  });

  it('отмечает тип каждой реплики в ленте текстом и классом', async () => {
    const manager = reference.assignees[0];
    current.comments = [
      { id: 'c1', kind: 'comment', text: 'Смотрим.', author: manager, createdAt: current.updatedAt },
      { id: 'c2', kind: 'clarification_request', text: 'Какой склад?', author: manager, createdAt: current.updatedAt },
      { id: 'c3', kind: 'clarification_response', text: 'Склад 2.', author: current.author, createdAt: current.updatedAt },
    ];
    await openCard('manager');
    const items = within(screen.getByRole('heading', { name: 'Комментарии' }).nextElementSibling as HTMLElement).getAllByRole('listitem');
    expect(items.map(item => item.querySelector('.comment-kind')?.textContent)).toEqual(['Комментарий', 'Запрос уточнения', 'Ответ автора']);
    expect(items.map(item => item.className)).toEqual(['comment comment-comment', 'comment comment-clarification_request', 'comment comment-clarification_response']);
    expect(new Set(Object.values(commentKindLabels)).size).toBe(3);
  });
});
