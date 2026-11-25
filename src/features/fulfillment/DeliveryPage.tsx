import { CheckCheck, Clock3, Copy, Mail, MapPin, RefreshCw, Trash2 } from 'lucide-react';
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
  const [doneSale, setDoneSale] = useState<DeliveryRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other'>('cash');
  const [deliverWithDue, setDeliverWithDue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const deliveries = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => apiFetch<{ data: DeliveryRow[]; requestId: string }>('/api/deliveries'),
  });
  async function deliveryDone(saleId: string): Promise<void> {
    setSubmitting(true);
    setError('');
    setNotice('');
    const response = await fetch(`/api/deliveries/${saleId}/confirm`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({
        paymentAmount: Number(paymentAmount || 0),
        paymentMethod,
        deliverWithDue,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Delivery could not be completed.');
    } else {
      const body = await response.json() as { data?: { amount_due?: number; paymentSms?: string; deliveredSms?: string } };
      const remainingDue = Number(body.data?.amount_due || 0);
      setNotice(remainingDue > 0 ? `Delivered. Remaining due: ${remainingDue.toFixed(2)}.` : 'Payment confirmed and delivery completed.');
      setDoneSale(null);
      setDeliverWithDue(false);
      setPaymentAmount('0');
      await deliveries.refetch();
    }
    setSubmitting(false);
  }

  async function deliveryAction(saleId: string, action: 'reschedule' | 'cancel' | 'reminder', extra: Record<string, unknown> = {}): Promise<void> {
    setSubmitting(true);
    setError('');
    const response = await fetch(`/api/deliveries/${saleId}/actions`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID(), ...extra }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Delivery action could not be completed.');
    } else {
      await deliveries.refetch();
    }
    setSubmitting(false);
  }

  async function copyDetails(row: DeliveryRow): Promise<void> {
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    const customerRelation = sale?.customers;
    const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
    const address = typeof sale?.delivery_address_snapshot?.addressLine === 'string'
      ? sale.delivery_address_snapshot.addressLine
      : 'Address unavailable';
    const text = `Order: ${sale?.receipt_number || 'N/A'}\nCustomer: ${customer?.name || 'Walk-in customer'}\nPhone: ${customer?.phone || 'N/A'}\nAddress: ${address}\nDue: ${Number(sale?.amount_due || 0).toFixed(2)}\nStatus: ${row.status}`;
    await navigator.clipboard.writeText(text);
    setError('Delivery details copied.');
  }

  const rows = deliveries.data?.data.data || [];
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Fulfillment"
        title="Delivery Queue"
        description={
          'Complete payments, deliveries, reschedules, reminders, and cancellations'
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          onClick={() => void deliveries.refetch()}
          className="border border-slate-300 bg-white text-slate-700"
        >
          <RefreshCw size={16} className="mr-2" /> Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}{' '}
      {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {doneSale && (
        <section className="mb-5 rounded-xl border border-emerald-200 bg-white p-5 shadow-sm" aria-label="Confirm delivery done">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-950">Confirm Delivery Done</h2>
              <p className="mt-1 text-sm text-slate-600">{doneSale.sales?.receipt_number || 'Order'} · Due {Number(doneSale.sales?.amount_due || 0).toFixed(2)}</p>
            </div>
            <button type="button" className="text-sm text-slate-500 underline" onClick={() => setDoneSale(null)}>Close</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Payment received
              <input aria-label="Payment received" type="number" min="0" max={Number(doneSale.sales?.amount_due || 0)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">Payment method
              <select aria-label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={deliverWithDue} onChange={(event) => setDeliverWithDue(event.target.checked)} /> Deliver while balance remains due
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button disabled={submitting || (Number(paymentAmount) < Number(doneSale.sales?.amount_due || 0) && !deliverWithDue)} onClick={() => void deliveryDone(doneSale.sale_id)} className="bg-emerald-700 text-white">
              Confirm payment & delivery
            </Button>
          </div>
        </section>
      )}
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
                  {row.status === 'delivered' || row.status === 'cancelled' || row.status === 'failed' ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                      Terminal state
                    </div>
                  ) : (
                    <div className="grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">
                      <Button
                        disabled={submitting}
                        onClick={() => void copyDetails(row)}
                        className="border border-slate-300 bg-white text-slate-700"
                      >
                        <Copy size={16} className="mr-2" /> Copy details
                      </Button>
                      <Button
                        disabled={submitting}
                        onClick={async () => {
                          const scheduledAt = window.prompt('Reschedule date/time (YYYY-MM-DDTHH:mm)', row.scheduled_at ? new Date(row.scheduled_at).toISOString().slice(0, 16) : '');
                          if (!scheduledAt) return;
                          const notes = window.prompt('Reschedule notes', '') || '';
                          await deliveryAction(row.sale_id, 'reschedule', { scheduledAt: new Date(scheduledAt).toISOString(), notes });
                        }}
                        className="border border-slate-300 bg-white text-slate-700"
                      >
                        <Clock3 size={16} className="mr-2" /> Reschedule
                      </Button>
                      <Button
                        disabled={submitting}
                        onClick={() => void deliveryAction(row.sale_id, 'reminder')}
                        className="border border-slate-300 bg-white text-slate-700"
                      >
                        <Mail size={16} className="mr-2" /> Email reminder
                      </Button>
                      <Button
                        disabled={submitting}
                        onClick={async () => {
                          if (!window.confirm('Cancel this order and restock every item?')) return;
                          const reason = window.prompt('Cancellation reason', '') || '';
                          await deliveryAction(row.sale_id, 'cancel', { notes: reason });
                        }}
                        className="border border-rose-200 bg-rose-50 text-rose-700"
                      >
                        <Trash2 size={16} className="mr-2" /> Cancel order
                      </Button>
                      <Button
                        disabled={submitting}
                        onClick={() => {
                          setDoneSale(row);
                          setPaymentAmount(String(Number(row.sales?.amount_due || 0)));
                          setDeliverWithDue(Number(row.sales?.amount_due || 0) === 0);
                        }}
                        className="col-span-2 bg-emerald-700 text-white sm:col-span-1"
                      >
                        <CheckCheck size={16} className="mr-2" /> Delivery Done
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
