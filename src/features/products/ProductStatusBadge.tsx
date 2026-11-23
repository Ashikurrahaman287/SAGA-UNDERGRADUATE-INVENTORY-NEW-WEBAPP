import type { ReactElement } from 'react';

export function StockStatusBadge({ status }: { status?: string }): ReactElement {
  const label =
    status === 'out_of_stock' ? 'Out of stock' : status === 'low_stock' ? 'Low stock' : 'In stock';
  const style =
    status === 'out_of_stock'
      ? 'bg-rose-100 text-rose-800'
      : status === 'low_stock'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-100 text-emerald-800';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}
export function ActiveBadge({ active }: { active: boolean }): ReactElement {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}
    >
      {active ? 'Active' : 'Archived'}
    </span>
  );
}
