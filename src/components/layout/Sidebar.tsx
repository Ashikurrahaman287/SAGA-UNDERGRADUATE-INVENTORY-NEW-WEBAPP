import { Boxes, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { ReactElement } from 'react';
import { getAuthorizedNavigation } from '../../lib/permissions/navigation';
import { useAuth } from '../../features/auth/use-auth';

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}): ReactElement {
  const auth = useAuth();
  const role = auth.session?.role;
  const groups = getAuthorizedNavigation(role);
  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/40 transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-slate-800 bg-[var(--color-sidebar)] text-slate-100 transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[76px]' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-4">
          <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'lg:w-10' : ''}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white">
              <Boxes size={19} />
            </div>
            <div className="whitespace-nowrap">
              <p className="text-sm font-bold tracking-[0.18em]">SAGA</p>
              <p className="text-[11px] text-slate-400">Inventory OS</p>
            </div>
          </div>
          <button
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {groups.map((group) => (
            <div key={group.label} className="mb-6">
              <p
                className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ${collapsed ? 'lg:hidden' : ''}`}
              >
                {group.label}
              </p>
              {group.items.map((navigationItem) => {
                const Icon = navigationItem.icon;
                return (
                  <NavLink
                    key={navigationItem.path}
                    to={navigationItem.path}
                    onClick={onCloseMobile}
                    title={collapsed ? navigationItem.label : undefined}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-white/10 font-semibold text-white shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'} ${collapsed ? 'lg:justify-center' : ''}`
                    }
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className={`whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>
                      {navigationItem.label}
                    </span>
                    {!navigationItem.implemented && !collapsed && (
                      <span className="ml-auto text-[9px] uppercase tracking-wide text-slate-600">
                        Preview
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-3 lg:block">
          <button
            onClick={onCloseMobile}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight size={17} />
            ) : (
              <>
                <ChevronLeft size={17} />
                <span>Collapse menu</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
