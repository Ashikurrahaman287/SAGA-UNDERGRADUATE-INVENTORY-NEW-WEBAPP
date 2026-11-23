import type { ReactNode } from 'react';
import type { ReactElement } from 'react';

export function PageToolbar({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );
}
