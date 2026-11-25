import { CheckCircle2, PackageCheck, Printer, Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

type PackagingRow = {
  id: string;
  sale_id: string;
  packaging_status: string;
  packaging_cost: number | string;
  updated_at: string;
  sales?: {
    receipt_number?: string;
    payment_status?: string;
    fulfillment_status?: string;
    customers?: { name?: string; phone?: string };
  } | null;
};

export function PackagingPage(): ReactElement {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['packaging', search],
    queryFn: () =>
      apiFetch<{ data: PackagingRow[]; requestId: string }>(
        `/api/packaging?search=${encodeURIComponent(search)}`,
      ),
  });
  async function transition(
    saleId: string,
    status: 'in_progress' | 'packed' | 'ready',
  ): Promise<void> {
    setSubmitting(true);
    setError('');
    const response = await fetch(`/api/packaging/${saleId}/transition`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ status, packagingCost: 0, idempotencyKey: crypto.randomUUID() }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Packaging status could not be updated.');
    } else await query.refetch();
    setSubmitting(false);
  }
  const rows = query.data?.data.data || [];
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Fulfillment"
        title="Packaging Queue"
        description="Prepare valid sales for rider delivery"
      />
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <Search size={17} className="text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Receipt, customer, or phone"
          className="flex-1 text-sm outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}{' '}
      {query.isPending ? (
        <LoadingState label="Loading packaging queue" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <div className="grid gap-4">
          {rows.map((row) => {
            const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
            const customer =
              sale?.customers && Array.isArray(sale.customers)
                ? sale.customers[0]
                : sale?.customers;
            return (
              <div
                key={row.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      {sale?.receipt_number || 'Sale'}
                    </p>
                    <h2 className="mt-1 font-semibold text-slate-900">
                      {customer?.name || 'Customer'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {customer?.phone || 'No phone'} · {row.packaging_status.replaceAll('_', ' ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.packaging_status === 'pending' && (
                      <Button
                        disabled={submitting}
                        onClick={() => void transition(row.sale_id, 'in_progress')}
                        className="border border-slate-300 bg-white text-slate-700"
                      >
                        Start packing
                      </Button>
                    )}
                    {row.packaging_status === 'in_progress' && (
                      <Button
                        disabled={submitting}
                        onClick={() => void transition(row.sale_id, 'packed')}
                        className="bg-blue-600 text-white"
                      >
                        <PackageCheck size={16} className="mr-2" /> Mark packed
                      </Button>
                    )}
                    {row.packaging_status === 'packed' && (
                      <Button
                        disabled={submitting}
                        onClick={() => void transition(row.sale_id, 'ready')}
                        className="bg-blue-600 text-white"
                      >
                        <CheckCircle2 size={16} className="mr-2" /> Mark ready
                      </Button>
                    )}
                    {row.packaging_status === 'ready' && (
                      <Button
                        disabled
                        className="border border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        <CheckCircle2 size={16} className="mr-2" /> Ready
                      </Button>
                    )}
                    <a
                      href={`/app/sales/${row.sale_id}/receipt`}
                      className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                    >
                      <Printer size={16} className="mr-2" /> Slip
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No packaging orders"
          description="Valid sales awaiting packaging will appear here."
        />
      )}
    </PageContainer>
  );
}
