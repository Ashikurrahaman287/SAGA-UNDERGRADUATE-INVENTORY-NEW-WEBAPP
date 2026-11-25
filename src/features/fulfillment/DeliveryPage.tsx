import { CheckCheck, MapPin, RefreshCw, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

type DeliveryRow = {
  id: string;
  sale_id: string;
  rider_user_id?: string | null;
  status: string;
  scheduled_at?: string | null;
  assigned_at?: string | null;
  sales?: {
    receipt_number?: string;
    total_amount?: number | string;
    amount_due?: number | string;
    delivery_address_snapshot?: Record<string, unknown>;
    customers?: { name?: string; phone?: string };
  } | null;
};

export function DeliveryPage(): ReactElement {
  const auth = useAuth();
  const [riderId, setRiderId] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const deliveries = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => apiFetch<{ data: DeliveryRow[]; requestId: string }>('/api/deliveries'),
  });
  const riders = useQuery({
    queryKey: ['active-riders'],
    queryFn: () => apiFetch<{ data: unknown[]; requestId: string }>('/api/admin/riders'),
  });
  async function updateStatus(
    saleId: string,
    status: 'out_for_delivery' | 'delivered' | 'failed',
  ): Promise<void> {
    setSubmitting(true);
    setError('');
    const response = await fetch(`/api/deliveries/${saleId}/status`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ status, idempotencyKey: crypto.randomUUID() }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Delivery status could not be updated.');
    } else await deliveries.refetch();
    setSubmitting(false);
  }
  async function collectPayment(saleId: string): Promise<void> {
    const amount = window.prompt('Amount collected');
    if (!amount) return;
    setSubmitting(true);
    setError('');
    const response = await fetch(`/api/deliveries/${saleId}/collect-payment`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({
        amount: Number(amount),
        paymentMethod: 'cash',
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Payment could not be collected.');
    } else await deliveries.refetch();
    setSubmitting(false);
  }
  async function markAllDelivered(): Promise<void> {
    setSubmitting(true);
    setError('');
    const response = await fetch('/api/deliveries/mark-all-delivered', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Deliveries could not be completed.');
    } else {
      const body = (await response.json()) as { data: { marked: number; skipped: number } };
      setError(body.data.skipped ? `${body.data.marked} delivered; ${body.data.skipped} skipped.` : `${body.data.marked} delivery(ies) marked delivered.`);
      await deliveries.refetch();
    }
    setSubmitting(false);
  }
  async function assign(saleId: string): Promise<void> {
    const selected = riderId[saleId];
    if (!selected) {
      setError('Select a Rider first.');
      return;
    }
    setSubmitting(true);
    setError('');
    const response = await fetch(`/api/deliveries/${saleId}/assign`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ riderUserId: selected, idempotencyKey: crypto.randomUUID() }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Delivery could not be assigned.');
    } else await deliveries.refetch();
    setSubmitting(false);
  }
  const rows = deliveries.data?.data.data || [];
  const riderRows = (riders.data?.data.data || []) as Array<{
    id: string;
    user_id?: string;
    name?: string;
  }>;
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Fulfillment"
        title={auth.session?.role === 'rider' ? 'My Deliveries' : 'Delivery Queue'}
        description={
          auth.session?.role === 'rider'
            ? 'Assigned deliveries only'
            : 'Assign and monitor organization deliveries'
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          onClick={() => void deliveries.refetch()}
          className="border border-slate-300 bg-white text-slate-700"
        >
          <RefreshCw size={16} className="mr-2" /> Refresh
        </Button>
        {auth.session?.role !== 'rider' && (
          <Button
            disabled={submitting}
            onClick={() => void markAllDelivered()}
            className="bg-emerald-700 text-white"
          >
            <CheckCheck size={16} className="mr-2" /> Mark all delivered
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}{' '}
      {deliveries.isPending ? (
        <LoadingState label="Loading deliveries" />
      ) : deliveries.isError ? (
        <ErrorState onRetry={() => void deliveries.refetch()} />
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      {sale?.receipt_number || 'Delivery'}
                    </p>
                    <h2 className="mt-1 font-semibold text-slate-900">
                      {customer?.name || 'Assigned customer'}
                    </h2>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                      <MapPin size={15} />{' '}
                      {typeof sale?.delivery_address_snapshot?.addressLine === 'string'
                        ? sale.delivery_address_snapshot.addressLine
                        : 'Address unavailable'}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Status:{' '}
                      <strong className="text-slate-900">{row.status.replaceAll('_', ' ')}</strong>
                    </p>
                  </div>
                  {auth.session?.role === 'rider' ? (
                    <div className="flex w-full max-w-sm flex-wrap gap-2">
                      {row.status === 'assigned' && (
                        <Button
                          disabled={submitting}
                          onClick={() => void updateStatus(row.sale_id, 'out_for_delivery')}
                          className="border border-slate-300 bg-white text-slate-700"
                        >
                          Start delivery
                        </Button>
                      )}
                      {row.status === 'out_for_delivery' && (
                        <>
                          <Button
                            disabled={submitting}
                            onClick={() => void collectPayment(row.sale_id)}
                            className="border border-slate-300 bg-white text-slate-700"
                          >
                            Collect payment
                          </Button>
                          <Button
                            disabled={submitting}
                            onClick={() => void updateStatus(row.sale_id, 'delivered')}
                            className="bg-blue-600 text-white"
                          >
                            Mark delivered
                          </Button>
                        </>
                      )}
                    </div>
                  ) : row.status === 'delivered' || row.status === 'cancelled' || row.status === 'failed' ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                      Terminal state
                    </div>
                  ) : (
                    <div className="flex w-full max-w-sm gap-2">
                      <select
                        value={riderId[row.sale_id] || ''}
                        onChange={(event) =>
                          setRiderId((current) => ({
                            ...current,
                            [row.sale_id]: event.target.value,
                          }))
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select active Rider</option>
                        {riderRows.map((rider) => (
                          <option key={rider.id} value={rider.user_id || rider.id}>
                            {rider.name || 'Rider'}
                          </option>
                        ))}
                      </select>
                      <Button
                        disabled={submitting}
                        onClick={() => void assign(row.sale_id)}
                        className="bg-blue-600 text-white"
                      >
                        <UserRound size={16} className="mr-2" /> Assign
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No deliveries found"
          description={
            auth.session?.role === 'rider'
              ? 'No deliveries are assigned to you.'
              : 'No delivery assignments exist in this organization.'
          }
        />
      )}
    </PageContainer>
  );
}
