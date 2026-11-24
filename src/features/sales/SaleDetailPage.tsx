import { ArrowLeft, Printer } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

export function SaleDetailPage(): ReactElement {
  const { id } = useParams();
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const sale = useQuery({
    queryKey: ['sale', id],
    queryFn: () =>
      apiFetch<{
        data: {
          sale: Record<string, unknown>;
          items: Array<Record<string, unknown>>;
          payments: Array<Record<string, unknown>>;
          receipt: Record<string, unknown> | null;
        };
        requestId: string;
      }>(`/api/sales/${id}`),
    enabled: Boolean(id),
  });
  if (sale.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading sale" />
      </PageContainer>
    );
  if (sale.isError || !sale.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void sale.refetch()} />
      </PageContainer>
    );
  const data = sale.data.data.data;
  const header = data.sale;
  const money = (value: unknown) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
  return (
    <PageContainer>
      <Link
        to="/app/sales/history"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
      >
        <ArrowLeft size={16} /> Back to sales history
      </Link>
      <PageHeader
        eyebrow="Sale record"
        title={`Receipt ${String(header.receipt_number)}`}
        description={new Date(String(header.created_at)).toLocaleString()}
        actions={
          <Button
            onClick={() => window.print()}
            className="border border-slate-300 bg-white text-slate-700"
          >
            <Printer size={16} className="mr-2" /> Print receipt
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Total" value={money(header.total_amount)} />
        <Info label="Amount paid" value={money(header.amount_paid)} />
        <Info label="Amount due" value={money(header.amount_due)} />
        <Info label="Payment" value={String(header.payment_status).replaceAll('_', ' ')} />
      </div>
      <PageSection title="Sale items">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Quantity</th>
                <th className="px-5 py-3">Unit price</th>
                <th className="px-5 py-3">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <tr key={String(item.id)}>
                  <td className="px-5 py-4 font-semibold text-slate-800">
                    {String(item.product_name_snapshot)}
                  </td>
                  <td className="px-5 py-4 text-slate-500">{String(item.sku_snapshot)}</td>
                  <td className="px-5 py-4">{String(item.quantity)}</td>
                  <td className="px-5 py-4">{money(item.unit_price)}</td>
                  <td className="px-5 py-4 font-semibold">{money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>
      <PageSection title="Payment history">
        {data.payments.length ? (
          <div className="space-y-2">
            {data.payments.map((payment) => (
              <div
                key={String(payment.id)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
              >
                <span className="font-semibold">{money(payment.amount)}</span>
                <span className="ml-3 text-slate-500">
                  {String(payment.payment_method)} ·{' '}
                  {new Date(String(payment.collected_at)).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No initial payment"
            description="This sale was created with no confirmed payment."
          />
        )}
      </PageSection>
    </PageContainer>
  );
}
function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
