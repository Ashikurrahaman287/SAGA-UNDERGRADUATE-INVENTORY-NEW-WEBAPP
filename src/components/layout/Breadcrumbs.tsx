import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactElement } from 'react';
import { navigationGroups } from '../../lib/permissions/navigation';

export function Breadcrumbs({ pathname }: { pathname: string }): ReactElement {
  const item = navigationGroups
    .flatMap((group) => group.items)
    .find((navigationItem) => navigationItem.path === pathname);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
      <Link to="/app" className="text-slate-400 hover:text-slate-700" aria-label="Workspace home">
        <Home size={16} />
      </Link>
      <ChevronRight size={14} className="shrink-0 text-slate-300" />
      {item ? (
        <span className="truncate font-semibold text-slate-800">{item.label}</span>
      ) : (
        <span className="truncate font-semibold text-slate-800">Workspace</span>
      )}
    </nav>
  );
}
