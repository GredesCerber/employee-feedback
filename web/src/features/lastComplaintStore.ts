import { useEffect, useSyncExternalStore } from 'react';
import { demoUsers, useSession } from '../app/session';
import type { Role } from '../app/session';

const prefix = 'last-complaint';
const changed = 'last-complaint-change';
const memory = new Map<string, string>();
let storageAvailable = true;
const valid = (id: string | null | undefined): id is string => !!id && /^[A-Za-z0-9_-]{1,100}$/.test(id);
export const complaintKey = (role: Role) => `${prefix}:${role}:${demoUsers[role]}`;

export function readLastComplaint(role: Role): string | null {
  const key = complaintKey(role);
  if (!storageAvailable) return memory.get(key) ?? null;
  try {
    const stored = localStorage.getItem(key);
    if (valid(stored)) { memory.set(key, stored); return stored; }
    memory.delete(key);
    return null;
  } catch { storageAvailable = false; return memory.get(key) ?? null; }
}
export function saveLastComplaint(role: Role, id: string | null) {
  const key = complaintKey(role);
  if (valid(id)) memory.set(key, id);
  else memory.delete(key);
  try {
    if (valid(id)) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch { storageAvailable = false; /* Keep the choice in memory. */ }
  window.dispatchEvent(new Event(changed));
}
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(changed, listener); window.removeEventListener('storage', listener); };
}
export function useLastComplaint(role: Role) {
  return useSyncExternalStore(subscribe, () => readLastComplaint(role), () => null);
}
/** Call only after a card has loaded successfully. */
export function useRememberComplaint(id?: string) {
  const { role } = useSession();
  useEffect(() => { if (role !== 'admin' && valid(id)) saveLastComplaint(role, id); }, [role, id]);
}
