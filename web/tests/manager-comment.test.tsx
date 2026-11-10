import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/client';
import { ManagerActions } from '../src/features/ComplaintActions';
import type { Complaint } from '../src/features/complaint';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('../src/app/session', () => ({ useSession: () => ({ api }) }));
const contractPath = existsSync(resolve('contracts/api.yaml')) ? resolve('contracts/api.yaml') : resolve('../contracts/api.yaml');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const reference = contract.components.schemas.ReferenceData.examples[0];
const example: Complaint = contract.paths['/complaints'].post.responses['201'].content['application/json'].examples.routed.value;
let item: Complaint;
const onUpdated = vi.fn();

beforeEach(() => {
  item = { ...structuredClone(example), status: 'in_review' };
  api.GET.mockReset().mockResolvedValue({ data: reference });
  api.POST.mockReset().mockResolvedValue({ data: item });
  onUpdated.mockReset();
});
afterEach(cleanup);

async function open() {
  const user = userEvent.setup();
  render(<ManagerActions item={item} onUpdated={onUpdated} />);
  await screen.findByRole('combobox', { name: 'Назначить ответственного' });
  const input = screen.getByLabelText('Комментарий или вопрос') as HTMLTextAreaElement;
  return { user, input };
}

describe('#200 manager comment submission', () => {
  it.each([
    ['Добавить комментарий', 'comment', 'Комментарий добавлен.'],
    ['Запросить уточнение', 'clarification_request', 'Запрос уточнения отправлен автору.'],
  ])('clears the text only after successful %s and cannot post it again', async (buttonName, kind, message) => {
    const { user, input } = await open();
    fireEvent.change(input, { target: { value: '  Уточните номер заявки.  ' } });
    const button = screen.getByRole('button', { name: buttonName });
    await user.click(button);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(message));
    expect(input.value).toBe('');
    expect(api.POST).toHaveBeenCalledExactlyOnceWith('/complaints/{complaintId}/comments', {
      params: { path: { complaintId: item.id } }, body: { kind, text: 'Уточните номер заявки.' },
    });
    await user.click(button);
    expect(api.POST).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('Введите текст сообщения.');
  });

  it('preserves the text and explains an error, then clears it after a successful retry', async () => {
    api.POST.mockRejectedValueOnce(new ApiError(409, 'INVALID_TRANSITION', 'Обращение уже изменилось. Обновите карточку.'));
    const { user, input } = await open();
    const text = 'Не потерять набранный комментарий.';
    fireEvent.change(input, { target: { value: text } });
    const button = screen.getByRole('button', { name: 'Добавить комментарий' });
    await user.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('Обращение уже изменилось. Обновите карточку.');
    expect(input.value).toBe(text);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(button.matches(':disabled')).toBe(false);
    await user.click(button);
    await waitFor(() => expect(input.value).toBe(''));
    expect(api.POST).toHaveBeenCalledTimes(2);
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('disables submission and sends only one request during a rapid repeated click', async () => {
    let finish!: (value: { data: Complaint }) => void;
    api.POST.mockReturnValueOnce(new Promise<{ data: Complaint }>(resolve => { finish = resolve; }));
    const { user, input } = await open();
    const text = 'Один комментарий вместо двух.';
    fireEvent.change(input, { target: { value: text } });
    const button = screen.getByRole('button', { name: 'Добавить комментарий' });
    await user.dblClick(button);
    expect(api.POST).toHaveBeenCalledTimes(1);
    expect(button.matches(':disabled')).toBe(true);
    expect(input.value).toBe(text);
    expect(onUpdated).not.toHaveBeenCalled();
    await act(async () => { finish({ data: item }); });
    expect(input.value).toBe('');
    expect(button.matches(':disabled')).toBe(false);
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });
});
