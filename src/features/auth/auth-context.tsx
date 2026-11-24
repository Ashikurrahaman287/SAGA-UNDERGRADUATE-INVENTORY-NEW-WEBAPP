import { useEffect, useState, type PropsWithChildren, type ReactElement } from 'react';
import { AuthContext, type AuthSession, type AuthState } from './auth-store';

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const body = (await response.json()) as { csrfToken?: string };
  if (!response.ok || !body.csrfToken) throw new Error('Security token could not be established.');
  return body.csrfToken;
}

async function readSession(): Promise<AuthSession | null> {
  const response = await fetch('/api/auth/me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Authentication status could not be verified.');
  const body = (await response.json()) as AuthSession | { authenticated: false };
  return body.authenticated ? body : null;
}

export function AuthProvider({ children }: PropsWithChildren): ReactElement {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [csrfToken, setCsrfToken] = useState('');

  const refresh = async (): Promise<void> => {
    try {
      const [token, session] = await Promise.all([getCsrfToken(), readSession()]);
      setCsrfToken(token);
      setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated' });
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Authentication is unavailable.',
      });
    }
  };

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const [token, session] = await Promise.all([getCsrfToken(), readSession()]);
        if (!active) return;
        setCsrfToken(token);
        setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated' });
      } catch (error) {
        if (!active) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Authentication is unavailable.',
        });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let lastSync = Date.now();
    const syncSession = async (): Promise<void> => {
      try {
        const [token, session] = await Promise.all([getCsrfToken(), readSession()]);
        setCsrfToken(token);
        setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated' });
      } catch (error) {
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Authentication is unavailable.',
        });
      }
    };
    const onFocus = (): void => {
      if (Date.now() - lastSync < 30_000) return;
      lastSync = Date.now();
      void syncSession();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const logout = async (): Promise<void> => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken },
    });
    setState({ status: 'unauthenticated' });
    await refresh();
  };

  return (
    <AuthContext.Provider value={{ ...state, csrfToken, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
