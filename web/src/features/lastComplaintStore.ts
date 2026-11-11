import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from '../app/session';
import type { Role } from '../app/session';
import { readLastComplaint, rememberLastComplaint, forgetLastComplaint } from './lastComplaint';

export { readLastComplaint } from './lastComplaint';
const changed = 'last-complaint-change';
const valid = (id: string | null | undefined): id is string => !!id && /^[A-Za-z0-9_-]{1,100}$/.test(id);
export function saveLastComplaint(role: Role, id: string | null) {
  if (valid(id)) rememberLastComplaint(role, id);
  else forgetLastComplaint(role);
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
/** Remember only a successfully loaded card. */
export function useRememberComplaint(id?: string) {
  const { role } = useSession();
  useEffect(() => { if (role !== 'admin' && valid(id)) saveLastComplaint(role, id); }, [role, id]);
}
