import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { LoadingState, ErrorState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';

export function PackingSlipPage(): ReactElement {
  const { saleId } = useParams();
  const query = useQuery({
    queryKey: ['packing-slip', saleId],
    queryFn: () =>
      apiFetch<{
        data: {
          sale: Record<string, unknown>;
          items: Array<Record<string, unknown>>;
          address: Record<string, unknown> | null;
        };
        requestId: string;
      }>(`/api/deliveries/${saleId}/packing-slip`),
    enabled: Boolean(saleId),
  });
  if (query.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading packing slip" />
      </PageContainer>
    );
  if (query.isError || !query.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void query.refetch()} />
      </PageContainer>
    );
  const data = query.data.data.data;
  return (
    <PageContainer>
      <div className="mb-5 flex justify-between print:hidden">
        <Link
          to="/app/packaging"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
        >
          <ArrowLeft size={16} /> Packaging queue
        </Link>
        <Button onClick={() => window.print()} className="bg-blue-600 text-white">
          <Printer size={16} className="mr-2" /> Print packing slip
        </Button>
      </div>
      <article className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <h1 className="text-2xl font-semibold text-slate-950">Packing slip</h1>
        <p className="mt-1 text-sm text-slate-500">Receipt {String(data.sale.receipt_number)}</p>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Delivery address
          </p>
          <p className="mt-2 text-slate-700">
            {typeof data.address?.address_line === 'string'
              ? data.address.address_line
              : String(data.sale.delivery_address_snapshot || '')}
          </p>
        </div>
        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-y border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-3">Item</th>
              <th className="py-3">SKU</th>
              <th className="py-3 text-right">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((item) => (
              <tr key={String(item.id)}>
                <td className="py-3 font-semibold text-slate-800">
                  {String(item.product_name_snapshot)}
                </td>
                <td className="py-3 text-slate-500">{String(item.sku_snapshot)}</td>
                <td className="py-3 text-right">{String(item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </PageContainer>
  );
}
