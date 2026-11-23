import {
  AlertCircle,
  CheckCircle2,
  FileQuestion,
  Inbox,
  LoaderCircle,
  ShieldAlert,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Button } from '../ui/button';

export function LoadingState({ label = 'Loading workspace' }: { label?: string }): ReactElement {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
      <LoaderCircle size={18} className="animate-spin text-blue-600" />
      {label}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <Inbox size={28} className="text-slate-300" />
      <h2 className="mt-4 text-base font-semibold text-slate-800">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function ErrorState({ onRetry }: { onRetry?: () => void }): ReactElement {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-6 text-center">
      <AlertCircle size={26} className="text-rose-600" />
      <p className="mt-3 text-sm font-semibold text-rose-800">This workspace could not load.</p>
      <p className="mt-1 text-sm text-rose-700">Try again or return to the previous page.</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-4 bg-rose-700 text-white">
          Try again
        </Button>
      )}
    </div>
  );
}
export function UnauthorizedState(): ReactElement {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-6 text-center">
      <ShieldAlert size={28} className="text-amber-600" />
      <h2 className="mt-4 text-base font-semibold text-amber-900">Access not available</h2>
      <p className="mt-2 text-sm text-amber-800">
        Your verified role does not permit this workspace.
      </p>
    </div>
  );
}
export function NotFoundState(): ReactElement {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center">
      <FileQuestion size={28} className="text-slate-400" />
      <h2 className="mt-4 text-base font-semibold text-slate-800">Page not found</h2>
      <p className="mt-2 text-sm text-slate-500">
        The address does not match an available workspace.
      </p>
    </div>
  );
}
export function ReadyState({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      <CheckCircle2 className="mr-2 inline-block" size={17} />
      {children}
    </div>
  );
}
