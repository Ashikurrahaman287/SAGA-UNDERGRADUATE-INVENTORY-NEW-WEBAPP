import { Outlet, useLocation } from 'react-router-dom';
import { useState, type ReactElement } from 'react';
import { UnauthorizedState } from '../common/States';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../features/auth/use-auth';
import { navigationGroups } from '../../lib/permissions/navigation';
import { hasPermission } from '../../lib/permissions/permission-utils';

export function AppLayout(): ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('saga_sidebar_collapsed') === 'true',
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const auth = useAuth();
  const routePermission = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.path === location.pathname)?.permission;
  const routeAllowed = !routePermission || hasPermission(auth.session?.role, routePermission);
  function toggleSidebar(): void {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('saga_sidebar_collapsed', String(next));
      return next;
    });
  }
  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-ink)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className={`min-h-screen transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'}`}
      >
        <Header
          onToggleSidebar={toggleSidebar}
          onOpenMobile={() => setMobileOpen(true)}
          pathname={location.pathname}
        />
        <main className="min-h-[calc(100vh-72px)] bg-[radial-gradient(ellipse_at_top_right,_rgba(208,225,255,0.5),_transparent_44%),var(--color-page)]">
          {routeAllowed ? (
            <Outlet />
          ) : (
            <div className="p-4 sm:p-7">
              <UnauthorizedState />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
