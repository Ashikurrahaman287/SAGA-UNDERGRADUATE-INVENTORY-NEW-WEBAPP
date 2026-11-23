import { Activity, ArrowUpRight, Boxes, ShieldCheck, Truck } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { ReadyState } from '../../components/common/States';
import { useAuth } from '../auth/use-auth';

export function HomePage(): ReactElement {
  const auth = useAuth();
  const session = auth.session!;
  const rider = session.role === 'rider';
  return (
    <PageContainer>
      <PageHeader
        eyebrow={rider ? 'Delivery workspace' : 'Operations workspace'}
        title={`Good to see you, ${session.user.name.split(' ')[0]}.`}
        description={
          rider
            ? 'Your delivery workspace is ready for assigned work.'
            : 'Your SAGA workspace is ready. The operational modules will appear here as they are enabled.'
        }
        actions={
          <Link
            to={rider ? '/app/delivery' : '/app/products'}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <ArrowUpRight size={16} /> Open workspace
          </Link>
        }
      />
      <ReadyState>
        Identity verified for {session.organization.name} as {session.role}.
      </ReadyState>
      <PageSection
        title="Workspace signals"
        description="A calm starting point for the work ahead."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Signal icon={<ShieldCheck />} label="Access context" value="Verified server-side" />
          <Signal icon={<Activity />} label="System status" value="Operational" />
          <Signal
            icon={rider ? <Truck /> : <Boxes />}
            label={rider ? 'Delivery focus' : 'Operations focus'}
            value={rider ? 'Assigned work only' : 'Foundation ready'}
          />
        </div>
      </PageSection>
    </PageContainer>
  );
}
function Signal({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
        {icon}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
