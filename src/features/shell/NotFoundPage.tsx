import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { NotFoundState } from '../../components/common/States';

export function NotFoundPage(): ReactElement {
  return (
    <PageContainer>
      <NotFoundState />
      <div className="mt-5 text-center">
        <Link to="/app" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          Return to workspace
        </Link>
      </div>
    </PageContainer>
  );
}
