import { LogOut, ShieldCheck, UserRound } from 'lucide-react';
import type { ReactElement } from 'react';
import { useAuth } from './use-auth';

export function AppLandingPage(): ReactElement {
  const auth = useAuth();
  const session = auth.session!;
  return (
    <main className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
              <ShieldCheck size={19} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-teal-700">SAGA</p>
              <p className="text-xs text-slate-500">Inventory Management</p>
            </div>
          </div>
          <button
            onClick={() => void auth.logout()}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={16} /> Sign out
          </button>
        </header>
        <section className="py-16">
          <p className="text-sm font-semibold text-teal-700">Secure workspace</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Welcome, {session.user.name}
          </h1>
          <p className="mt-4 max-w-xl text-slate-600">
            Your identity and access context have been verified by the SAGA server.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Info
              icon={<UserRound size={18} />}
              label="Account"
              value={session.user.email || session.user.id}
            />
            <Info icon={<ShieldCheck size={18} />} label="Verified role" value={session.role} />
            <Info
              icon={<ShieldCheck size={18} />}
              label="Organization"
              value={session.organization.name}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
function Info({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-teal-700">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-3 break-words text-sm font-semibold capitalize text-slate-800">{value}</p>
    </div>
  );
}
