/**
 * Срок и ответственный в блоке «Что будет дальше» до отправки (#317, A6).
 * Срок берётся из правила категории dueInDays справочника /reference-data: тот же источник,
 * по которому сервер задаёт dueAt при регистрации.
 */
export type PreSubmitCategory = { id: string; dueInDays: number; assigneeId: string | null };

export type PreSubmitDeadline = { days: number; hasOwner: boolean };

export function preSubmitDeadline(categories: readonly PreSubmitCategory[] | undefined, categoryId: string): PreSubmitDeadline | null {
  const category = categories?.find(item => item.id === categoryId);
  if (!category || !Number.isInteger(category.dueInDays) || category.dueInDays <= 0) return null;
  return { days: category.dueInDays, hasOwner: category.assigneeId !== null };
}
