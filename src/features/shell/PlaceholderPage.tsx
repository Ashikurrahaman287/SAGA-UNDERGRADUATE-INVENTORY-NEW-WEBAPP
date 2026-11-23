import { ArrowLeft, Construction, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState } from '../../components/common/States';
import { navigationGroups } from '../../lib/permissions/navigation';

export function PlaceholderPage(): ReactElement {
  const location = useLocation();
  const item = navigationGroups
    .flatMap((group) => group.items)
    .find((navigationItem) => navigationItem.path === location.pathname);
  const label = item?.label || 'Workspace page';
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Foundation preview"
        title={label}
        description="This route is reserved in the SAGA application shell and will be implemented in a later product task."
      />
      <PageSection>
        <EmptyState
          title="Module not enabled yet"
          description="The navigation, authorization boundary, and responsive page frame are ready. Business records and workflows will arrive in their dedicated implementation task."
          action={
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <ArrowLeft size={16} /> Return to workspace
            </Link>
          }
        />
      </PageSection>
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <Construction size={19} />
        <span>
          <strong>{label}</strong> is a visual route placeholder, not a working business module.
        </span>
        <Sparkles size={16} className="ml-auto text-blue-500" />
      </div>
    </PageContainer>
  );
}
