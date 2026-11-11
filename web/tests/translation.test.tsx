import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TranslatableText } from '../src/features/TranslatableText';
import { ApiError } from '../src/api/client';

const { post, api } = vi.hoisted(() => { const post = vi.fn(); return { post, api: { POST: post } }; });
vi.mock('../src/app/session', () => ({ useSession: () => ({ api }) }));
afterEach(cleanup);
beforeEach(() => post.mockReset());
const original = 'Исходный текст';
const panel = (text = original, complaintId = 'one') => <TranslatableText complaintId={complaintId} field="description" text={text} />;
const success = (translatedText: string) => ({ data: { translatedText, targetLocale: 'en', source: 'llm' } });
describe('TranslatableText', () => {
  it('requests only on click, keeps original and shows plain text until hidden', async () => {
    post.mockResolvedValue(success('<img src=x onerror=alert(1)>'));
    const { container } = render(panel());
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Язык перевода'), { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перевести' }));
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(screen.getByText(original)).toBeTruthy(); expect(container.querySelector('img')).toBeNull();
    expect(post.mock.calls[0]![1].body).toEqual({ field: 'description', targetLocale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть перевод' }));
    expect(screen.queryByText('<img src=x onerror=alert(1)>')).toBeNull(); expect(screen.getByText(original)).toBeTruthy();
  });
  it('keeps the original on service failure and retries explicitly', async () => {
    post.mockRejectedValueOnce(new ApiError(503, 'TRANSLATION_UNAVAILABLE', 'Unavailable')).mockResolvedValueOnce(success('Translated'));
    render(panel()); fireEvent.click(screen.getByRole('button', { name: 'Перевести' }));
    expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.getByText(original)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' })); expect(await screen.findByText('Translated')).toBeTruthy();
  });
  it('discards a late answer after target and card changes', async () => {
    let finish!: (value: unknown) => void;
    post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(success('Fresh'));
    const view = render(panel()); fireEvent.click(screen.getByRole('button', { name: 'Перевести' }));
    fireEvent.change(screen.getByLabelText('Язык перевода'), { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перевести' })); expect(await screen.findByText('Fresh')).toBeTruthy();
    finish(success('Stale')); await waitFor(() => expect(screen.queryByText('Stale')).toBeNull());
    view.rerender(panel('Другой текст', 'two')); expect(screen.queryByText('Fresh')).toBeNull(); expect(screen.getByText('Другой текст')).toBeTruthy();
  });
});
