import { Activity, ArrowUpRight, Boxes, CircleCheck, Code2, ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { apiFetch } from '../../lib/api/client';

type Health = { status: string; service: string; timestamp: string; requestId: string };

export function WelcomePage(): ReactElement {
  const health = useQuery({ queryKey: ['health'], queryFn: () => apiFetch<Health>('/api/health') });
  const healthy = health.isSuccess && health.data.data.status === 'ok';
  return (
    <main className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f766e] text-white shadow-sm">
              <Boxes size={21} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-[0.18em] text-[#0f766e]">SAGA</p>
              <p className="text-xs text-slate-500">Inventory Management</p>
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
            Foundation v0.1.0
          </span>
        </header>
        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div className="max-w-2xl">
            <p className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Operational clarity, built in.
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-6xl">
              A steadier way to move your business forward.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
              SAGA brings inventory, sales, fulfillment, and the people behind them into one
              dependable operational home.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                className="bg-[#0f766e] text-white hover:bg-[#115e59]"
                onClick={() =>
                  document.getElementById('system-status')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                View system status <ArrowUpRight size={16} className="ml-2" />
              </Button>
              <Button
                className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                onClick={() => window.open('https://github.com', '_blank', 'noopener,noreferrer')}
              >
                Developer workspace <Code2 size={16} className="ml-2" />
              </Button>
            </div>
          </div>
          <Card className="overflow-hidden border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-200/70">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Foundation snapshot
              </p>
              <p className="mt-2 text-xl font-medium">Ready for the next layer</p>
            </div>
            <div className="space-y-1 px-6 py-5">
              <StatusRow
                icon={<ShieldCheck size={18} />}
                label="Secure by boundary"
                detail="Server-side secrets"
              />
              <StatusRow
                icon={<Activity size={18} />}
                label="API heartbeat"
                detail={
                  health.isPending
                    ? 'Checking...'
                    : healthy
                      ? 'Responding normally'
                      : 'Needs attention'
                }
              />
              <StatusRow
                icon={<CircleCheck size={18} />}
                label="Frontend shell"
                detail="Responsive and accessible"
              />
            </div>
          </Card>
        </section>
        <section
          id="system-status"
          className="grid gap-4 border-t border-slate-200 py-8 sm:grid-cols-3"
        >
          <InfoItem
            label="System status"
            value={health.isPending ? 'Checking' : healthy ? 'Operational' : 'Unavailable'}
            accent={healthy ? 'text-emerald-700' : 'text-amber-700'}
          />
          <InfoItem label="API service" value="saga-inventory-api" />
          <InfoItem label="Environment" value="Foundation / local" />
        </section>
        <footer className="flex flex-col gap-2 border-t border-slate-200 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <span>Built for focused, accountable operations.</span>
          <span>Task 01 foundation</span>
        </footer>
      </div>
    </main>
  );
}

function StatusRow({
  icon,
  label,
  detail,
}: {
  icon: ReactElement;
  label: string;
  detail: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-4 rounded-xl px-2 py-3">
      <span className="text-teal-300">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-xs text-slate-400">{detail}</span>
    </div>
  );
}
function InfoItem({
  label,
  value,
  accent = 'text-slate-800',
}: {
  label: string;
  value: string;
  accent?: string;
}): ReactElement {
  return (
    <div className="rounded-xl bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${accent}`}>{value}</p>
    </div>
  );
}
