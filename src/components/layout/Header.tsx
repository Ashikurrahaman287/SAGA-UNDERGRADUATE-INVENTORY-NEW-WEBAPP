import { Bell, ChevronDown, Menu, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/use-auth';
import { Breadcrumbs } from './Breadcrumbs';

export function Header({
  onToggleSidebar,
  onOpenMobile,
  pathname,
}: {
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
  pathname: string;
}): ReactElement {
  const auth = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const session = auth.session;
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onOpenMobile}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:block"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <Breadcrumbs pathname={pathname} />
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen((open) => !open)}
            className="relative rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell size={19} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-600" />
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 top-12 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              <p className="mt-3 text-sm text-slate-500">No new notifications.</p>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100"
            aria-label="Open user menu"
            aria-expanded={userMenuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800">
              {session?.user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[150px] sm:block">
              <span className="block truncate text-sm font-semibold text-slate-800">
                {session?.user.name}
              </span>
              <span className="block truncate text-xs capitalize text-slate-500">
                {session?.role} · {session?.organization.name}
              </span>
            </span>
            <ChevronDown size={16} className="hidden text-slate-400 sm:block" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{session?.user.name}</p>
                <p className="truncate text-xs text-slate-500">{session?.user.email}</p>
              </div>
              <Link
                to="/app"
                onClick={() => setUserMenuOpen(false)}
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <UserRound size={16} /> Account information
              </Link>
              <button
                onClick={() => void auth.logout()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
