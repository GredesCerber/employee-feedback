import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createApiClient } from '../api/client';
import type { ApiClient, components } from '../api/client';

export type Role = components['schemas']['Role'];
export const demoUsers: Record<Role, string> = { employee: 'employee-1', manager: 'manager-1', admin: 'admin-1' };
type Session = { role: Role; setRole: (role: Role) => void; api: ApiClient };
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('employee');
  const value = useMemo(() => ({ role, setRole, api: createApiClient({ userId: demoUsers[role] }) }), [role]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
