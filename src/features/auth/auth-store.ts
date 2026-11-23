import { createContext } from 'react';

export type AuthUser = { id: string; name: string; email?: string };
export type AuthOrganization = { id: string; name: string };
export type AuthRole = 'admin' | 'moderator' | 'rider';
export type AuthSession = {
  authenticated: true;
  user: AuthUser;
  organization: AuthOrganization;
  role: AuthRole;
};
export type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error';
  session?: AuthSession;
  error?: string;
};
export type AuthContextValue = AuthState & {
  csrfToken: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
