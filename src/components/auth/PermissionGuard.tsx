import type { ReactElement, ReactNode } from 'react';
import { useAuth } from '../../features/auth/use-auth';
import { hasPermission, type Permission } from '../../lib/permissions/permission-utils';

export function PermissionGuard({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}): ReactElement | null {
  const auth = useAuth();
  const role = auth.status === 'authenticated' ? auth.session?.role : undefined;
  return hasPermission(role, permission) ? <>{children}</> : <>{fallback}</>;
}
