import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

export function ReturnDetailPage(): ReactElement {
  const { id } = useParams();
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const query = useQuery({
    queryKey: ['return', id],
    queryFn: () =>
      apiFetch<{
        data: {
          return: Record<string, unknown>;
          items: Array<Record<string, unknown>>;
          refunds: Array<Record<string, unknown>>;
          stockMovements: Array<Record<string, unknown>>;
        };
        requestId: string;
      }>(`/api/returns/${id}`),
    enabled: Boolean(id),
  });
  if (query.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading return" />
      </PageContainer>
    );
  if (query.isError || !query.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void query.refetch()} />
      </PageContainer>
    );
  const data = query.data.data.data;
  const returnRow = data.return;
  const money = (value: unknown) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
  return (
    <PageContainer>
      <Link
        to="/app/returns"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
      >
        <ArrowLeft size={16} /> Back to returns
      </Link>
      <PageHeader
        eyebrow="Return record"
        title={String(returnRow.return_number)}
        description={String(returnRow.reason)}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Info label="Status" value={String(returnRow.status)} />
        <Info label="Restock decision" value={String(returnRow.restock_decision)} />
        <Info label="Refund amount" value={money(returnRow.total_amount)} />
      </div>
      <PageSection title="Returned items">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Original item</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Quantity</th>
                <th className="px-5 py-3">Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item) => {
                const saleItem = Array.isArray(item.sale_items)
                  ? item.sale_items[0]
                  : (item.sale_items as Record<string, unknown> | undefined);
                return (
                  <tr key={String(item.id)}>
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {String(saleItem?.product_name_snapshot || 'Sale item')}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {String(saleItem?.sku_snapshot || '—')}
                    </td>
                    <td className="px-5 py-4">{String(item.quantity)}</td>
                    <td className="px-5 py-4 font-semibold">{money(item.refund_amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageSection>
      <PageSection title="Refund record">
        {data.refunds.length ? (
          <div className="space-y-2">
            {data.refunds.map((refund) => (
              <div
                key={String(refund.id)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
              >
                <div className="flex justify-between">
                  <strong>{money(refund.amount)}</strong>
                  <span className="capitalize text-slate-500">{String(refund.status)}</span>
                </div>
                <p className="mt-2 text-slate-600">
                  {String(refund.refund_method)} · {String(refund.reason)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No refund record"
            description="No processed refund is associated with this return."
          />
        )}
      </PageSection>
      <PageSection title="Stock movements">
        <div className="space-y-2">
          {data.stockMovements.length ? (
            data.stockMovements.map((movement) => (
              <div
                key={String(movement.id)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
              >
                <RotateCcw size={17} className="text-blue-600" />
                <span className="flex-1">Restored {String(movement.quantity)} units</span>
                <span className="text-slate-500">
                  {new Date(String(movement.created_at)).toLocaleString()}
                </span>
              </div>
            ))
          ) : (
            <EmptyState
              title="No stock restoration"
              description="The selected restock decision did not create a stock increment."
            />
          )}
        </div>
      </PageSection>
    </PageContainer>
  );
}
function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
