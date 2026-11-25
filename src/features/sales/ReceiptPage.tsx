import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';

export function ReceiptPage(): ReactElement {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['receipt', id],
    queryFn: () =>
      apiFetch<{
        data: {
          organization: {
            name: string;
            business_phone?: string | null;
            business_email?: string | null;
            business_address?: string | null;
            currency: string;
            timezone: string;
          } | null;
          settings: {
            receipt_header?: string | null;
            receipt_footer?: string | null;
            receipt_notes?: string | null;
          } | null;
          sale: Record<string, unknown>;
          items: Array<Record<string, unknown>>;
        };
        requestId: string;
      }>(`/api/sales/${id}/receipt`),
    enabled: Boolean(id),
  });
  if (query.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading receipt" />
      </PageContainer>
    );
  if (query.isError || !query.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void query.refetch()} />
      </PageContainer>
    );
  const data = query.data.data.data;
  const sale = data.sale;
  const customer = sale.customers as { name?: string; phone?: string; email?: string } | null;
  const seller = sale.sellers as { name?: string; reference_code?: string } | null;
  const currency = data.organization?.currency || 'USD';
  const money = (value: unknown) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
  const addressSnapshot = sale.delivery_address_snapshot as { addressLine?: unknown } | null;
  const addressText =
    typeof addressSnapshot?.addressLine === 'string' ? addressSnapshot.addressLine : '';
  const notesText = typeof sale.notes === 'string' ? sale.notes : '';
  const scheduledAt = typeof sale.delivery_scheduled_at === 'string' ? sale.delivery_scheduled_at : null;
  const businessTimezone = data.organization?.timezone || 'UTC';
  return (
    <PageContainer>
      <div className="mb-5 flex justify-between print:hidden">
        <Link
          to="/app/sales/history"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
        >
          <ArrowLeft size={16} /> Sales history
        </Link>
        <Button onClick={() => window.print()} className="bg-blue-600 text-white">
          <Printer size={16} className="mr-2" /> Print receipt
        </Button>
      </div>
      <article className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="bg-[#1b388c] px-8 py-7 text-center text-white print:px-4">
          <p className="text-xs font-bold tracking-[0.18em] text-blue-100">
            {data.organization?.name || 'SAGA Inventory'}
          </p>
          {data.settings?.receipt_header && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-blue-50">
              {data.settings.receipt_header}
            </p>
          )}
          {data.organization?.business_phone && (
            <p className="mt-2 text-xs text-blue-100">{data.organization.business_phone}</p>
          )}
          {data.organization?.business_address && (
            <p className="mt-1 text-xs text-blue-100">{data.organization.business_address}</p>
          )}
          <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-blue-100">Order confirmation</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Sales receipt</h1>
          <p className="mt-2 text-sm text-blue-100">{String(sale.receipt_number)}</p>
        </header>
        <div className="bg-[#f0f5ff] px-8 py-5 text-sm text-slate-700 print:px-4">
          <p className="font-semibold text-[#1e3a8a]">Thank you, {customer?.name?.split(/\s+/)[0] || 'Customer'}!</p>
          <p className="mt-1">Your order has been placed successfully. Please find your purchase summary below.</p>
        </div>
        <div className="px-8 py-5 print:px-4">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer</p>
            <p className="mt-1 font-semibold text-slate-800">
              {customer?.name || 'Walk-in customer'}
            </p>
            {customer?.phone && <p className="mt-1 text-slate-500">{customer.phone}</p>}
            {customer?.email && <p className="mt-1 text-slate-500">{customer.email}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Sale date</p>
            <p className="mt-1 text-slate-700">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: businessTimezone,
              }).format(new Date(String(sale.created_at)))}
            </p>
            {seller?.name && (
              <p className="mt-2 text-slate-600">
                Seller: {seller.name}
                {seller.reference_code ? ` (${seller.reference_code})` : ''}
              </p>
            )}
          </div>
        </div>
        {scheduledAt && (
          <section className="my-5 rounded-md border border-blue-100 border-l-4 border-l-blue-600 bg-[#f2f7ff] px-5 py-4 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-[#1e3a8a]">Delivery schedule</p>
            <p className="mt-2 text-blue-800">{new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeStyle:'short',timeZone:businessTimezone}).format(new Date(scheduledAt))}</p>
            {addressText && <p className="mt-1 text-blue-800">{addressText}</p>}
          </section>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1b388c] text-xs uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3 text-center">Qty</th>
                <th className="px-3 py-3 text-right">Unit</th>
                <th className="px-3 py-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <tr key={String(item.sku_snapshot)}>
                  <td className="bg-slate-50 px-3 py-3">
                    <span className="block font-semibold text-slate-800">
                      {String(item.product_name_snapshot)}
                    </span>
                    <span className="text-xs text-slate-500">{String(item.sku_snapshot)}</span>
                  </td>
                  <td className="bg-slate-50 px-3 py-3 text-center">{String(item.quantity)}</td>
                  <td className="bg-slate-50 px-3 py-3 text-right">{money(item.unit_price)}</td>
                  <td className="bg-slate-50 px-3 py-3 text-right font-semibold">{money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-5 max-w-xs space-y-2 border-t border-slate-200 pt-4 text-sm">
          <Amount label="Subtotal" value={money(sale.subtotal)} />
          <Amount label="Discount" value={money(sale.discount_amount)} />
          <Amount label="Delivery fee" value={money(sale.delivery_fee)} />
          <Amount label="Total" value={money(sale.total_amount)} strong />
          <Amount label="Amount paid" value={money(sale.amount_paid)} />
          <Amount label="Amount due" value={money(sale.amount_due)} strong />
        </div>
        {addressText && (
          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Delivery address
            </p>
            <p className="mt-1 text-slate-700">{addressText}</p>
          </div>
        )}
        {data.settings?.receipt_notes && (
          <div className="mt-4 whitespace-pre-wrap text-sm text-slate-600">
            {data.settings.receipt_notes}
          </div>
        )}
        {notesText && (
          <div className="mt-4 text-sm text-slate-600">
            <strong>Notes:</strong> {notesText}
          </div>
        )}
        {data.settings?.receipt_footer && (
          <footer className="mt-8 whitespace-pre-wrap border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
            {data.settings.receipt_footer}
          </footer>
        )}
        <section className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5 text-center print:break-inside-avoid">
          <p className="font-semibold text-green-800">✓ Order placed successfully</p>
          <p className="mt-2 text-sm text-slate-600">We’ll prepare your items with care. Thank you for choosing us.</p>
        </section>
        </div>
      </article>
    </PageContainer>
  );
}
function Amount({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): ReactElement {
  return (
    <div
      className={`flex justify-between ${strong ? 'font-semibold text-slate-950' : 'text-slate-600'}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
