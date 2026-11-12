import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ResultFeedback, ProblemBanner } from '../src/features/ResultFeedback';
import { ImprovementsList } from '../src/features/improvements';
import { ImpactPanel } from '../src/features/ImpactPanel';
import { MergeIntoProblem } from '../src/features/sharedProblems';
import type { Complaint } from '../src/features/complaint';

const session = vi.hoisted(() => ({ api: { GET: vi.fn(), POST: vi.fn() }, role: 'employee' }));
vi.mock('../src/app/session', () => ({ useSession: () => session }));
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
const done = (): Complaint => ({ ...structuredClone(example), status: 'implemented', decision: { outcome: 'implemented', explanation: 'Сделано.', actions: null, author: example.author as never, createdAt: '2026-11-10T10:00:00Z' } });

beforeEach(() => { session.role = 'employee'; session.api.GET.mockReset(); session.api.POST.mockReset(); });
afterEach(cleanup);

describe('подтверждение результата', () => {
  it('требует оба ответа и отправляет оценку', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    session.api.POST.mockResolvedValue({ data: done() });
    render(<ResultFeedback item={done()} onUpdated={onUpdated} />);
    await user.click(screen.getByRole('button', { name: 'Отправить оценку' }));
    expect(screen.getByRole('alert').textContent).toContain('Ответьте на оба вопроса');
    expect(session.api.POST).not.toHaveBeenCalled();
    const radios = screen.getAllByRole('radio');
    await user.click(radios[0]!); // «Понятен ли ответ?» — Да
    await user.click(radios[3]!); // «Решена ли проблема?» — Нет
    await user.click(screen.getByRole('button', { name: 'Отправить оценку' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(session.api.POST).toHaveBeenCalledWith('/complaints/{complaintId}/feedback', { params: { path: { complaintId: example.id } }, body: { understood: true, solved: false } });
  });

  it('не показывается до итога, а после оценки показывает ответы', () => {
    const { rerender, container } = render(<ResultFeedback item={{ ...done(), status: 'in_review' }} onUpdated={vi.fn()} />);
    expect(container.textContent).toBe('');
    rerender(<ResultFeedback item={{ ...done(), feedback: { understood: true, solved: false, createdAt: '2026-11-11T10:00:00Z' } }} onUpdated={vi.fn()} />);
    expect(screen.getByText('Понятен ли ответ?').nextSibling?.textContent).toBe('Да');
    expect(screen.getByText('Решена ли проблема?').nextSibling?.textContent).toBe('Нет');
    expect(screen.queryByRole('button', { name: 'Отправить оценку' })).toBeNull();
  });

  it('руководитель видит, что оценки ещё нет', () => {
    session.role = 'manager';
    render(<ResultFeedback item={done()} onUpdated={vi.fn()} />);
    expect(screen.getByText('Автор ещё не оценил результат.')).toBeTruthy();
  });

  it('автор видит план общей проблемы', () => {
    render(<ProblemBanner item={{ ...done(), problem: { id: 'problem-1', title: 'Нет версии документа', plan: 'Завести реестр', createdAt: '2026-11-10T10:00:00Z' } }} />);
    expect(screen.getByText('Нет версии документа')).toBeTruthy();
    expect(screen.getByText('Завести реестр')).toBeTruthy();
  });
});

describe('лента улучшений', () => {
  it('показывает подтверждения и метку «ваше»', () => {
    render(<ImprovementsList items={[{ key: 'k1', categoryId: 'training', categoryName: 'Обучение', result: 'Курс запущен.', implementedAt: '2026-11-10T10:00:00Z', problemTitle: null, reportersCount: 3, answeredCount: 2, confirmedCount: 1, mine: true }]} />);
    expect(screen.getByText('Курс запущен.')).toBeTruthy();
    expect(screen.getByText('Это ваше обращение')).toBeTruthy();
    expect(screen.getByText(/Подтвердили результат: 1 из 2/)).toBeTruthy();
    expect(screen.getByText(/Сообщили сотрудников: 3/)).toBeTruthy();
  });
  it('пустая лента объясняет, что улучшений ещё нет', () => {
    render(<ImprovementsList items={[]} />);
    expect(screen.getByText('Реализованных улучшений пока нет.')).toBeTruthy();
  });
});

describe('панель эффекта пилота', () => {
  it('сравнивает период с прошлым и называет изменившуюся тему', async () => {
    session.role = 'manager';
    const period = (total: number) => ({ total, reachEmployees: 2, employeesTotal: 5, reviewedCount: 1, reviewedShare: 0.5, implementedCount: 1, feedbackCount: 0, solvedCount: 0, solvedShare: null, understoodShare: null });
    session.api.GET.mockResolvedValue({ data: { generatedAt: '2026-11-12T10:00:00Z', days: 7, current: period(6), previous: period(4),
      categories: [{ categoryId: 'documents', categoryName: 'Документооборот', current: 5, previous: 1 }] } });
    render(<MemoryRouter><ImpactPanel /></MemoryRouter>);
    expect(await screen.findByText(/Обращений по теме «Документооборот» стало больше: 1 → 5/)).toBeTruthy();
    expect(screen.getByRole('row', { name: /Обращений за период 6 4 \+2/ })).toBeTruthy();
    expect(screen.getByRole('row', { name: /Охват сотрудников 2 \/ 5/ })).toBeTruthy();
    expect(screen.getAllByText('Нет данных').length).toBeGreaterThan(0);
  });
});

describe('общая проблема у руководителя', () => {
  it('ищет похожие и отправляет объединение только с выбранными', async () => {
    session.role = 'manager';
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    session.api.GET.mockResolvedValue({ data: { items: [{ id: 'complaint-9', number: 'A-009', categoryId: 'documents', categoryName: 'Документооборот', status: 'new', score: 0.5 }] } });
    session.api.POST.mockResolvedValue({ data: { id: 'problem-1' } });
    render(<MergeIntoProblem item={{ ...example, status: 'in_review' }} categoryName="Документооборот" onUpdated={onUpdated} />);
    await user.click(screen.getByText('Объединить с похожими в общую проблему'));
    await user.click(screen.getByRole('button', { name: 'Объединить' }));
    expect(screen.getByRole('alert').textContent).toContain('Выберите хотя бы одно');
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Объединить' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(session.api.POST).toHaveBeenCalledWith('/problems', { body: { title: 'Документооборот', complaintIds: [example.id, 'complaint-9'] } });
  });
  it('не предлагает объединение для завершённого обращения', () => {
    session.role = 'manager';
    const { container } = render(<MergeIntoProblem item={done()} categoryName="x" onUpdated={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
