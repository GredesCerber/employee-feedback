import type { Role } from '../app/session';
import { demoUsers } from '../app/session';

/** Ключ localStorage: JSON-объект «роль:пользователь» → id обращения. Хранится только id. */
export const LAST_COMPLAINT_KEY = 'employee-feedback.last-complaint.v1';

// Запасная память на сессию: нужна только когда localStorage недоступен или не принимает запись.
const memory = new Map<string, string>();

const slot = (role: Role) => `${role}:${demoUsers[role]}`;

/** null — хранилище недоступно; {} — доступно, но пусто или испорчено. */
function readMap(): Record<string, string> | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LAST_COMPLAINT_KEY);
  } catch {
    return null;
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

function writeMap(value: Record<string, string>): boolean {
  try {
    localStorage.setItem(LAST_COMPLAINT_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** id последнего успешно открытого обращения для этой роли или null. */
export function readLastComplaint(role: Role): string | null {
  const key = slot(role);
  const map = readMap();
  if (map === null) return memory.get(key) ?? null;
  return map[key] ?? null;
}

/** Запомнить обращение, которое успешно загрузилось. */
export function rememberLastComplaint(role: Role, complaintId: string): void {
  const key = slot(role);
  const map = readMap();
  if (map !== null && writeMap({ ...map, [key]: complaintId })) {
    memory.delete(key);
    return;
  }
  memory.set(key, complaintId);
}

/**
 * Забыть указатель. Если передан complaintId, стирается только совпадающий указатель,
 * чтобы сетевой сбой или чужой id не стирали последнее обращение.
 */
export function forgetLastComplaint(role: Role, complaintId?: string): void {
  const key = slot(role);
  const current = readLastComplaint(role);
  if (complaintId !== undefined && current !== complaintId) return;
  memory.delete(key);
  const map = readMap();
  if (map !== null && key in map) {
    const next = { ...map };
    delete next[key];
    writeMap(next);
  }
}

/** Путь к карточке обращения для роли: сотрудник — /my, руководитель — /queue. */
export function lastComplaintPath(role: Role, complaintId: string): string {
  return `${role === 'manager' ? '/queue' : '/my'}/${complaintId}`;
}
