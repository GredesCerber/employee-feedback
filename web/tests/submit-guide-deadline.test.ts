import { describe, expect, it } from 'vitest';
import { preSubmitDeadline } from '../src/features/submitGuide';

const categories = [
  { id: 'it', dueInDays: 7, assigneeId: 'mgr-1' },
  { id: 'training', dueInDays: 14, assigneeId: null },
  { id: 'broken', dueInDays: 0, assigneeId: null },
];

describe('#317 срок и ответственный до отправки', () => {
  it('Given выбрана категория, When блок считается, Then срок равен dueInDays категории', () => {
    expect(preSubmitDeadline(categories, 'it')).toEqual({ days: 7, hasOwner: true });
  });

  it('Given у категории нет назначенного ответственного, When блок считается, Then hasOwner=false', () => {
    expect(preSubmitDeadline(categories, 'training')).toEqual({ days: 14, hasOwner: false });
  });

  it('Given категория не выбрана, When блок считается, Then срок не показывается', () => {
    expect(preSubmitDeadline(categories, '')).toBeNull();
  });

  it('Given справочник ещё не загружен или срок некорректен, When блок считается, Then срок не показывается и ошибки нет', () => {
    expect(preSubmitDeadline(undefined, 'it')).toBeNull();
    expect(preSubmitDeadline(categories, 'broken')).toBeNull();
  });
});
