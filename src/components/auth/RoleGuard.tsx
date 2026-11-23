import type { ReactElement, ReactNode } from 'react';
import type { AuthRole } from '../../features/auth/auth-store';
import { useAuth } from '../../features/auth/use-auth';

export function RoleGuard({
  roles,
  children,
  fallback = null,
}: {
  roles: readonly AuthRole[];
  children: ReactNode;
  fallback?: ReactNode;
}): ReactElement | null {
  const auth = useAuth();
  const role = auth.status === 'authenticated' ? auth.session?.role : undefined;
  return role && roles.includes(role) ? <>{children}</> : <>{fallback}</>;
}
