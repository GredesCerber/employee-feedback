import type { components } from '../api/client';
import type { LocationPoint } from './MapPicker';

/**
 * Черновик формы подачи (#312 A2). Хранится в sessionStorage отдельно для каждой демо-роли:
 * живёт, пока открыта вкладка, переживает уход на другие экраны и обратно.
 * Очищается после успешной отправки и кнопкой «Очистить»; после ошибки отправки остаётся.
 */
export type ComplaintType = components['schemas']['ComplaintType'];
export type SubmitDraft = {
  type: ComplaintType;
  categoryId: string;
  description: string;
  solution: string;
  anonymous: boolean;
  location?: LocationPoint;
};

export const DRAFT_KEY_PREFIX = 'employee-feedback.submit-draft.';
const types: readonly ComplaintType[] = ['problem', 'suggestion', 'praise'];

export function draftKey(role: string): string {
  return `${DRAFT_KEY_PREFIX}${role}`;
}

export function isEmptyDraft(draft: SubmitDraft): boolean {
  return draft.type === 'problem' && !draft.categoryId && !draft.description.trim() && !draft.solution.trim()
    && !draft.anonymous && !draft.location;
}

function validPoint(value: unknown): LocationPoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { latitude, longitude } = value as Record<string, unknown>;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude };
}

/** Читает черновик; повреждённые или чужие данные и недоступное хранилище дают undefined. */
export function readDraft(role: string): SubmitDraft | undefined {
  try {
    const raw = sessionStorage.getItem(draftKey(role));
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== 'object') return undefined;
    const draft: SubmitDraft = {
      type: types.includes(value.type as ComplaintType) ? value.type as ComplaintType : 'problem',
      categoryId: typeof value.categoryId === 'string' ? value.categoryId : '',
      description: typeof value.description === 'string' ? value.description : '',
      solution: typeof value.solution === 'string' ? value.solution : '',
      anonymous: value.anonymous === true,
      ...(validPoint(value.location) ? { location: validPoint(value.location) } : {}),
    };
    return isEmptyDraft(draft) ? undefined : draft;
  } catch {
    return undefined;
  }
}

/** Пустой черновик не храним: удаляем ключ. Ошибки хранилища (приватный режим, квота) молча игнорируются. */
export function writeDraft(role: string, draft: SubmitDraft): void {
  try {
    if (isEmptyDraft(draft)) sessionStorage.removeItem(draftKey(role));
    else sessionStorage.setItem(draftKey(role), JSON.stringify(draft));
  } catch { /* хранилище недоступно: форма работает без черновика */ }
}

export function clearDraft(role: string): void {
  try { sessionStorage.removeItem(draftKey(role)); } catch { /* хранилище недоступно */ }
}
