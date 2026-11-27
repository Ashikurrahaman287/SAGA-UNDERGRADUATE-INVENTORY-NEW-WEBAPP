import { CheckCheck, Clock3, Copy, Mail, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { apiFetch } from '../../lib/api/client';
import { formatMinorUnits, parseMinorUnits } from '../../lib/utils/money';
import { useAuth } from '../auth/use-auth';
import { formatDateTimeInput, formatDeliveryDate, getDeliveryTab, localDateTimeToUtcIso, type DeliveryTab } from './delivery-date';

type DeliveryItem = {
  product_name_snapshot?: string | null;
  sku_snapshot?: string | null;
  quantity?: number | string;
};
type Customer = { name?: string; phone?: string; email?: string };
type DeliverySale = {
  id?: string;
  receipt_number?: string;
  total_amount?: number | string;
  confirmed_paid_amount?: number | string | null;
  amount_paid?: number | string | null;
  amount_due?: number | string;
  delivery_address_snapshot?: Record<string, unknown> | null;
  delivery_scheduled_at?: string | null;
  created_at?: string | null;
  fulfillment_status?: string;
  customers?: Customer | Customer[] | null;
  sale_items?: DeliveryItem[] | null;
};
type DeliveryRow = {
  id: string;
  sale_id: string;
  rider_user_id?: string | null;
  status: string;
  scheduled_at?: string | null;
  assigned_at?: string | null;
  delivered_at?: string | null;
  created_at?: string | null;
  sales?: DeliverySale | DeliverySale[] | null;
};
type DeliveryResponse = { data: DeliveryRow[]; completed: DeliveryRow[]; timezone: string };
type ActionResult = Record<string, unknown>;
const tabs: Array<{ key: DeliveryTab; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'upcoming', label: 'Upcoming' },
];

function relationOne<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value || undefined;
}
function addressLines(snapshot: Record<string, unknown> | null | undefined): string[] {
  if (!snapshot) return [];
  return ['addressLine', 'address_line', 'area', 'city', 'deliveryInstructions', 'delivery_instructions']
    .map((key) => snapshot[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}
function money(value: number | string | null | undefined, currency: string): string {
  return formatMinorUnits(parseMinorUnits(Number(value || 0)), currency);
}
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
function isFutureInstant(value: string): boolean {
  return new Date(value).getTime() > Date.now();
}

export function DeliveryPage(): ReactElement {
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'BDT';
  const timezone = auth.session?.organization.timezone || 'Asia/Dhaka';
  const [activeTab, setActiveTab] = useState<DeliveryTab>('today');
  const [doneSale, setDoneSale] = useState<DeliveryRow | null>(null);
  const [rescheduleSale, setRescheduleSale] = useState<DeliveryRow | null>(null);
  const [reminderSale, setReminderSale] = useState<DeliveryRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('0.00');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other'>('cash');
  const [deliverWithDue, setDeliverWithDue] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [reminderKey, setReminderKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const actionLock = useRef(false);
  const deliveries = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => apiFetch<DeliveryResponse>('/api/deliveries'),
  });

  async function postAction(url: string, payload: Record<string, unknown>): Promise<ActionResult | null> {
    if (actionLock.current) return null;
    actionLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { data?: ActionResult; error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message || 'Delivery action could not be completed.');
        return null;
      }
      return body.data || {};
    } catch (requestError) {
      setError(errorMessage(requestError, 'The delivery service could not be reached.'));
      return null;
    } finally {
      actionLock.current = false;
      setSubmitting(false);
    }
  }

  async function deliveryDone(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!doneSale) return;
    const sale = relationOne(doneSale.sales);
    const dueMinor = parseMinorUnits(Number(sale?.amount_due || 0));
    let receivedMinor: number;
    try {
      receivedMinor = parseMinorUnits(paymentAmount);
    } catch {
      setError('Enter a valid payment amount.');
      return;
    }
    if (receivedMinor < 0 || receivedMinor > dueMinor) {
      setError(`Payment must be between 0 and ${money(sale?.amount_due, currency)}.`);
      return;
    }
    if (receivedMinor < dueMinor && !deliverWithDue) {
      setError('Confirm delivery with the remaining balance due, or enter the full amount received.');
      return;
    }
    const result = await postAction(`/api/deliveries/${doneSale.sale_id}/confirm`, {
      paymentAmount: receivedMinor / 100,
      paymentMethod,
      deliverWithDue,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!result) return;
    const remainingDue = Number(result.amount_due || 0);
    const emailStatus = result.deliveryEmail;
    const emailNotice = emailStatus === 'sent' ? 'Delivery email sent.'
      : emailStatus === 'failed' ? 'Delivery email could not be sent.'
        : emailStatus === 'opted_out' ? 'Email skipped because the customer opted out.' : '';
    setToast([remainingDue > 0 ? `Delivered with ${money(remainingDue, currency)} still due.` : 'Delivery completed and balance paid.', emailNotice].filter(Boolean).join(' '));
    setDoneSale(null);
    setDeliverWithDue(false);
    setPaymentAmount('0.00');
    await deliveries.refetch();
  }

  function openReschedule(row: DeliveryRow): void {
    const initial = formatDateTimeInput(row.scheduled_at || relationOne(row.sales)?.delivery_scheduled_at || new Date().toISOString(), timezone);
    setRescheduleDate(initial.date);
    setRescheduleTime(initial.time);
    setRescheduleNotes('');
    setError('');
    setRescheduleSale(row);
  }

  async function reschedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!rescheduleSale) return;
    let scheduledAt: string;
    try {
      scheduledAt = localDateTimeToUtcIso(rescheduleDate, rescheduleTime || '12:00', timezone);
      if (!isFutureInstant(scheduledAt)) throw new Error('Choose a future delivery date and time.');
    } catch (scheduleError) {
      setError(errorMessage(scheduleError, 'Enter a valid delivery date.'));
      return;
    }
    const result = await postAction(`/api/deliveries/${rescheduleSale.sale_id}/actions`, {
      action: 'reschedule',
      scheduledAt,
      notes: rescheduleNotes.trim() || undefined,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!result) return;
    setRescheduleSale(null);
    setToast('Delivery date updated.');
    await deliveries.refetch();
  }

  async function sendReminder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!reminderSale) return;
    const result = await postAction(`/api/deliveries/${reminderSale.sale_id}/actions`, {
      action: 'reminder',
      idempotencyKey: reminderKey,
    });
    if (!result) return;
    setReminderSale(null);
    setToast('Delivery reminder email sent.');
    await deliveries.refetch();
  }

  async function cancelOrder(row: DeliveryRow): Promise<void> {
    if (!window.confirm('Cancel this order and restock every item?')) return;
    const reason = window.prompt('Cancellation reason', '') || '';
    const result = await postAction(`/api/deliveries/${row.sale_id}/actions`, {
      action: 'cancel', notes: reason, idempotencyKey: crypto.randomUUID(),
    });
    if (!result) return;
    setToast('Order cancelled and stock restored.');
    await deliveries.refetch();
  }

  async function copyDetails(row: DeliveryRow): Promise<void> {
    const sale = relationOne(row.sales);
    const customer = relationOne(sale?.customers);
    const address = addressLines(sale?.delivery_address_snapshot).join(', ') || 'Address unavailable';
    const items = (sale?.sale_items || []).map((item) => `${item.product_name_snapshot || 'Item'} (${item.sku_snapshot || 'No SKU'}) x${item.quantity || 0}`).join('\n');
    const text = `Order: ${sale?.receipt_number || 'N/A'}\nCustomer: ${customer?.name || 'Walk-in customer'}\nPhone: ${customer?.phone || 'N/A'}\nAddress: ${address}\nItems:\n${items}\nTotal: ${money(sale?.total_amount, currency)}\nPaid: ${money(sale?.confirmed_paid_amount ?? sale?.amount_paid, currency)}\nDue: ${money(sale?.amount_due, currency)}`;
    try {
      await navigator.clipboard.writeText(text);
      setToast('Delivery details copied.');
    } catch {
      setError('Could not access the clipboard.');
    }
  }

  const responseData = deliveries.data?.data;
  const rows = responseData?.data || [];
  const completed = responseData?.completed || [];
  const businessTimezone = responseData?.timezone || timezone;
  const now = new Date();
  const activeRows = rows.filter((row) => !['delivered', 'cancelled', 'failed'].includes(row.status));
  const grouped = {
    today: activeRows.filter((row) => getDeliveryTab(row.scheduled_at || relationOne(row.sales)?.delivery_scheduled_at, now, businessTimezone) === 'today'),
    tomorrow: activeRows.filter((row) => getDeliveryTab(row.scheduled_at || relationOne(row.sales)?.delivery_scheduled_at, now, businessTimezone) === 'tomorrow'),
    upcoming: activeRows.filter((row) => getDeliveryTab(row.scheduled_at || relationOne(row.sales)?.delivery_scheduled_at, now, businessTimezone) === 'upcoming'),
  };
  const currencyCode = auth.session?.organization.currency || 'BDT';
  const selectedRows = grouped[activeTab];

  return (
    <PageContainer>
      <PageHeader eyebrow="Fulfillment" title="Delivery Queue" description="Review delivery dates, order details, payments, reminders, and completion." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => void deliveries.refetch()} className="border border-slate-300 bg-white text-slate-700">
          <RefreshCw size={16} className="mr-2" /> Refresh
        </Button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-40 max-w-md rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg">{toast}<button type="button" className="ml-3 font-semibold underline" onClick={() => setToast('')}>Dismiss</button></div>}

      <div role="tablist" aria-label="Active delivery schedule" className="mb-5 flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((tab) => (
          <button key={tab.key} id={`delivery-tab-${tab.key}`} type="button" role="tab" aria-selected={activeTab === tab.key} aria-controls="delivery-tabpanel" onClick={() => setActiveTab(tab.key)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === tab.key ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>
            {tab.label}<span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{grouped[tab.key].length}</span>
          </button>
        ))}
      </div>

      {deliveries.isPending ? <LoadingState label="Loading deliveries" /> : deliveries.isError ? <ErrorState onRetry={() => void deliveries.refetch()} /> : (
        <section id="delivery-tabpanel" role="tabpanel" aria-labelledby={`delivery-tab-${activeTab}`}>
          {selectedRows.length ? <div className="grid gap-4">{selectedRows.map((row) => (
            <DeliveryCard key={row.sale_id} row={row} currency={currencyCode} timezone={businessTimezone} submitting={submitting} onDone={() => {
              const sale = relationOne(row.sales);
              const due = Number(sale?.amount_due || 0);
              setDoneSale(row);
              setPaymentAmount(due.toFixed(2));
              setDeliverWithDue(due === 0);
              setError('');
            }} onReschedule={() => openReschedule(row)} onReminder={() => {
              setReminderKey(crypto.randomUUID());
              setReminderSale(row);
              setError('');
            }} onCancel={() => void cancelOrder(row)} onCopy={() => void copyDetails(row)} />
          ))}</div> : <EmptyState title={`No ${activeTab} deliveries`} description="Scheduled and unscheduled active deliveries will appear in the appropriate date group." />}
        </section>
      )}

      <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="completed-deliveries-heading">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div><h2 id="completed-deliveries-heading" className="text-lg font-semibold text-slate-950">Delivery Done</h2><p className="mt-1 text-sm text-slate-600">Completed orders are kept separate from the active schedule.</p></div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">{completed.length}</span>
        </div>
        {completed.length ? <div className="grid gap-4">{completed.map((row) => <DeliveryCard key={row.sale_id} row={row} currency={currencyCode} timezone={businessTimezone} completed />)}</div> : <EmptyState title="No completed deliveries" description="Orders marked delivered will appear here." />}
      </section>

      <Dialog open={Boolean(doneSale)} onClose={() => setDoneSale(null)} title="Confirm Delivery Done" description="Record any payment received, then confirm the order was delivered." width="large">
        {doneSale && <DeliveryDoneForm row={doneSale} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} deliverWithDue={deliverWithDue} setDeliverWithDue={setDeliverWithDue} currency={currencyCode} timezone={businessTimezone} submitting={submitting} error={error} onSubmit={(event) => void deliveryDone(event)} />}
      </Dialog>

      <Dialog open={Boolean(rescheduleSale)} onClose={() => setRescheduleSale(null)} title="Reschedule delivery" description="Choose the new date and optional delivery time in the organization timezone.">
        {rescheduleSale && <form onSubmit={(event) => void reschedule(event)} className="space-y-4">
          <OrderIdentity row={rescheduleSale} />
          <p className="text-xs text-slate-500">Business timezone: {businessTimezone}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Delivery date<input required type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Delivery time (optional)<input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Reason or note (optional)<textarea maxLength={1000} rows={3} value={rescheduleNotes} onChange={(event) => setRescheduleNotes(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" onClick={() => setRescheduleSale(null)} className="border border-slate-300 bg-white text-slate-700">Close</Button><Button type="submit" disabled={submitting || !rescheduleDate} className="bg-blue-700 text-white">{submitting ? 'Saving...' : 'Save new date'}</Button></div>
        </form>}
      </Dialog>

      <Dialog open={Boolean(reminderSale)} onClose={() => setReminderSale(null)} title="Send delivery reminder" description="Preview the email before sending. This action sends email only; it does not send SMS.">
        {reminderSale && <ReminderForm row={reminderSale} currency={currencyCode} timezone={businessTimezone} submitting={submitting} error={error} onSubmit={(event) => void sendReminder(event)} onClose={() => setReminderSale(null)} />}
      </Dialog>
    </PageContainer>
  );
}

function DeliveryCard({ row, currency, timezone, completed = false, submitting = false, onDone, onReschedule, onReminder, onCancel, onCopy }: {
  row: DeliveryRow;
  currency: string;
  timezone: string;
  completed?: boolean;
  submitting?: boolean;
  onDone?: () => void;
  onReschedule?: () => void;
  onReminder?: () => void;
  onCancel?: () => void;
  onCopy?: () => void;
}): ReactElement {
  const sale = relationOne(row.sales);
  const customer = relationOne(sale?.customers);
  const address = addressLines(sale?.delivery_address_snapshot);
  const paid = sale?.confirmed_paid_amount ?? sale?.amount_paid;
  const deliveryDate = completed
    ? row.delivered_at || row.scheduled_at || sale?.delivery_scheduled_at
    : row.scheduled_at || sale?.delivery_scheduled_at;
  const fallbackDate = row.created_at || sale?.created_at;
  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm sm:p-5 ${completed ? 'border-emerald-200' : 'border-slate-200'}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{sale?.receipt_number || 'Order'}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${completed ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'}`}>{completed ? 'Delivered' : row.status.replaceAll('_', ' ')}</span></div>
          <h3 className="mt-1 text-base font-semibold text-slate-950">{customer?.name || 'Customer'}</h3>
          <p className="mt-1 text-sm text-slate-600">{customer?.phone ? <a href={`tel:${customer.phone}`} className="underline decoration-slate-300 underline-offset-2">{customer.phone}</a> : 'No phone number'}</p>
          <p className="mt-3 flex items-start gap-2 text-sm text-slate-600"><MapPin size={16} className="mt-0.5 shrink-0" /><span>{address.length ? address.join(', ') : 'Address unavailable'}</span></p>
          <p className="mt-3 text-sm text-slate-700"><strong className="font-semibold text-slate-900">Delivery date:</strong> {formatDeliveryDate(deliveryDate, fallbackDate, timezone)}</p>
          <div className="mt-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Delivery items</h4>
            {sale?.sale_items?.length ? <ul className="mt-2 divide-y divide-slate-100 border-y border-slate-100">{sale.sale_items.map((item, index) => <li key={`${item.sku_snapshot || 'item'}-${index}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm"><span className="font-medium text-slate-800">{item.product_name_snapshot || 'Item'} <span className="font-normal text-slate-500">· SKU {item.sku_snapshot || '—'}</span></span><span className="text-slate-700">Qty {item.quantity ?? 0}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No item details available.</p>}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-3 text-sm">
            <MoneyValue label="Total" value={sale?.total_amount} currency={currency} />
            <MoneyValue label="Paid" value={paid} currency={currency} />
            <MoneyValue label="Due" value={sale?.amount_due} currency={currency} emphasized />
          </dl>
        </div>
        {!completed && <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:w-[420px]">
          <Button disabled={submitting} onClick={onCopy} className="border border-slate-300 bg-white text-slate-700"><Copy size={15} className="mr-2" />Copy details</Button>
          <Button disabled={submitting} onClick={onReschedule} className="border border-slate-300 bg-white text-slate-700"><Clock3 size={15} className="mr-2" />Reschedule</Button>
          <Button disabled={submitting || !customer?.email} onClick={onReminder} title={!customer?.email ? 'Customer email is missing' : undefined} className="border border-slate-300 bg-white text-slate-700"><Mail size={15} className="mr-2" />Send reminder</Button>
          <Button disabled={submitting} onClick={onCancel} className="border border-rose-200 bg-rose-50 text-rose-700"><Trash2 size={15} className="mr-2" />Cancel order</Button>
          <Button disabled={submitting} onClick={onDone} className="col-span-2 bg-emerald-700 text-white sm:col-span-1"><CheckCheck size={15} className="mr-2" />Delivery Done</Button>
        </div>}
      </div>
    </article>
  );
}

function MoneyValue({ label, value, currency, emphasized = false }: { label: string; value?: number | string | null; currency: string; emphasized?: boolean }): ReactElement {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 font-semibold tabular-nums ${emphasized ? 'text-amber-800' : 'text-slate-900'}`}>{money(value, currency)}</dd></div>;
}

function OrderIdentity({ row }: { row: DeliveryRow }): ReactElement {
  const sale = relationOne(row.sales);
  const customer = relationOne(sale?.customers);
  return <div className="rounded-md bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-900">{sale?.receipt_number || 'Order'}</p><p className="mt-1 text-slate-600">{customer?.name || 'Customer'}{customer?.phone ? ` · ${customer.phone}` : ''}</p></div>;
}

function DeliveryDoneForm({ row, paymentAmount, setPaymentAmount, paymentMethod, setPaymentMethod, deliverWithDue, setDeliverWithDue, currency, timezone, submitting, error, onSubmit }: {
  row: DeliveryRow;
  paymentAmount: string;
  setPaymentAmount: (value: string) => void;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other';
  setPaymentMethod: (value: 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other') => void;
  deliverWithDue: boolean;
  setDeliverWithDue: (value: boolean) => void;
  currency: string;
  timezone: string;
  submitting: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): ReactElement {
  const sale = relationOne(row.sales);
  const dueMinor = parseMinorUnits(Number(sale?.amount_due || 0));
  let receivedMinor = 0;
  try { receivedMinor = parseMinorUnits(paymentAmount); } catch { receivedMinor = 0; }
  const remainingMinor = Math.max(0, dueMinor - receivedMinor);
  return <form onSubmit={onSubmit} className="space-y-4">
    <OrderIdentity row={row} />
    <div className="grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-3"><MoneyValue label="Order total" value={sale?.total_amount} currency={currency} /><MoneyValue label="Already paid" value={sale?.confirmed_paid_amount ?? sale?.amount_paid} currency={currency} /><MoneyValue label="Outstanding due" value={sale?.amount_due} currency={currency} emphasized /></div>
    <p className="text-xs text-slate-500">Delivery schedule: {formatDeliveryDate(row.scheduled_at || sale?.delivery_scheduled_at, row.created_at || sale?.created_at, timezone)}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">Payment received<input aria-label="Payment received" required type="number" min="0" max={Number(sale?.amount_due || 0)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium text-slate-700">Payment method<select aria-label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="other">Other</option></select></label>
    </div>
    <p className={`rounded-md px-3 py-2 text-sm ${remainingMinor ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>{remainingMinor ? `Partial payment. ${formatMinorUnits(remainingMinor, currency)} will remain due; it will not be marked paid.` : 'The outstanding balance will be fully paid.'}</p>
    {remainingMinor > 0 && <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={deliverWithDue} onChange={(event) => setDeliverWithDue(event.target.checked)} className="mt-1" /><span>Confirm delivery while the remaining {formatMinorUnits(remainingMinor, currency)} stays due.</span></label>}
    {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="submit" disabled={submitting || (remainingMinor > 0 && !deliverWithDue)} className="bg-emerald-700 text-white">{submitting ? 'Saving...' : 'Mark Delivered'}</Button></div>
  </form>;
}

function ReminderForm({ row, currency, timezone, submitting, error, onSubmit, onClose }: {
  row: DeliveryRow;
  currency: string;
  timezone: string;
  submitting: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}): ReactElement {
  const sale = relationOne(row.sales);
  const customer = relationOne(sale?.customers);
  return <form onSubmit={onSubmit} className="space-y-4">
    <OrderIdentity row={row} />
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt className="text-slate-500">Recipient</dt><dd className="break-all font-medium text-slate-900">{customer?.email || 'No email address'}</dd><dt className="text-slate-500">Delivery date</dt><dd className="text-slate-900">{formatDeliveryDate(row.scheduled_at || sale?.delivery_scheduled_at, row.created_at || sale?.created_at, timezone)}</dd><dt className="text-slate-500">Order total</dt><dd className="text-slate-900">{money(sale?.total_amount, currency)}</dd><dt className="text-slate-500">Balance due</dt><dd className="text-slate-900">{money(sale?.amount_due, currency)}</dd></dl>
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Email preview · Email only</p><p className="mt-2 text-sm font-semibold text-slate-900">Your delivery is coming up, {(customer?.name || 'Customer').split(/\s+/)[0]}</p><p className="mt-1 text-sm leading-6 text-slate-700">Order {sale?.receipt_number || ''} is scheduled for delivery. Please keep your phone available.</p><p className="mt-2 text-xs text-slate-500">No SMS will be sent by this reminder action.</p></div>
    {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" onClick={onClose} className="border border-slate-300 bg-white text-slate-700">Close</Button><Button type="submit" disabled={submitting || !customer?.email} className="bg-blue-700 text-white"><Mail size={15} className="mr-2" />{submitting ? 'Sending...' : 'Send email reminder'}</Button></div>
  </form>;
}
