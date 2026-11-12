import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManagerActions } from '../src/features/ComplaintActions';
import type { Complaint } from '../src/features/complaint';

// Идея «черновик ответа ответственному»: шаблон подставляется в поле, ничего не отправляется.
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('../src/app/session', () => ({ useSession: () => ({ api }) }));
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const reference = contract.components.schemas.ReferenceData.examples[0];
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;

beforeEach(() => { api.GET.mockReset().mockResolvedValue({ data: reference }); api.POST.mockReset(); });
afterEach(cleanup);

describe('шаблоны ответа руководителя', () => {
  it('вставляет шаблон вопроса и сохраняет уже набранный текст, не отправляя его', async () => {
    const user = userEvent.setup();
    render(<ManagerActions item={{ ...structuredClone(example), status: 'in_review' }} onUpdated={vi.fn()} />);
    await screen.findByRole('combobox', { name: 'Назначить ответственного' });
    const input = screen.getByLabelText('Комментарий или вопрос') as HTMLTextAreaElement;
    await user.type(input, 'Добрый день.');
    await user.click(screen.getByRole('button', { name: 'Вставить шаблон вопроса' }));
    expect(input.value.startsWith('Добрый день.\n\nЗдравствуйте!')).toBe(true);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it('шаблон решения зависит от итога: отказ содержит причину', async () => {
    const user = userEvent.setup();
    render(<ManagerActions item={{ ...structuredClone(example), status: 'new' }} onUpdated={vi.fn()} />);
    await screen.findByRole('combobox', { name: 'Назначить ответственного' });
    await user.click(screen.getByRole('button', { name: 'Вставить шаблон решения' }));
    expect((screen.getByLabelText('Мотивированный отказ') as HTMLTextAreaElement).value).toContain('Причина:');
  });
});
