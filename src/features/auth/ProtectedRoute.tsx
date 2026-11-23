import { Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './use-auth';
import { hasPermission, type Permission } from '../../lib/permissions/permission-utils';

export function ProtectedRoute({
  children,
  permission,
}: {
  children: ReactElement;
  permission?: Permission;
}): ReactElement {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'error')
    return <ErrorScreen message={auth.error || 'Authentication is unavailable.'} />;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  if (permission && !hasPermission(auth.session?.role, permission)) return <ForbiddenScreen />;
  return children;
}

export function PublicOnlyRoute({ children }: { children: ReactElement }): ReactElement {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'authenticated') return <Navigate to="/app" replace />;
  return children;
}

function LoadingScreen(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f8] text-sm text-slate-500">
      Checking secure session...
    </main>
  );
}
function ErrorScreen({ message }: { message: string }): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f8] px-5 text-center text-sm text-rose-700">
      {message}
    </main>
  );
}
function ForbiddenScreen(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f8] px-5 text-center text-sm text-rose-700">
      You do not have access to this workspace.
    </main>
  );
}
