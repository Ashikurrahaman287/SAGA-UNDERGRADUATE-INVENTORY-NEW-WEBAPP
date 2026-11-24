import { RotateCcw, Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

type SaleRow = {
  id: string;
  receipt_number: string;
  total_amount: number | string;
  fulfillment_status: string;
  customer_name?: string;
};
type SaleItem = {
  id: string;
  sale_item_id?: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
};

export function CreateReturnPage(): ReactElement {
  const auth = useAuth();
  const navigate = useNavigate();
  const [receiptSearch, setReceiptSearch] = useState('');
  const [saleId, setSaleId] = useState('');
  const [reason, setReason] = useState('');
  const [restockDecision, setRestockDecision] = useState<'restock' | 'discard'>('restock');
  const [refundMethod, setRefundMethod] = useState<
    'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other'
  >('cash');
  const [refundAmount, setRefundAmount] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const sales = useQuery({
    queryKey: ['return-sale-search', receiptSearch],
    queryFn: () =>
      apiFetch<{ data: SaleRow[]; total: number; requestId: string }>(
        `/api/sales?search=${encodeURIComponent(receiptSearch)}&page=1&pageSize=10`,
      ),
  });
  const sale = useQuery({
    queryKey: ['return-sale', saleId],
    queryFn: () =>
      apiFetch<{ data: { sale: Record<string, unknown>; items: SaleItem[] }; requestId: string }>(
        `/api/sales/${saleId}`,
      ),
    enabled: Boolean(saleId),
  });
  const rows = sales.data?.data.data || [];
  const saleItems = sale.data?.data.data.items || [];
  const selectedItems = saleItems
    .filter((item) => (quantities[item.id] || 0) > 0)
    .map((item) => ({ saleItemId: item.id, quantity: quantities[item.id] || 0 }));
  async function submit(): Promise<void> {
    if (!saleId || !selectedItems.length) {
      setError('Select a sale and at least one return line.');
      return;
    }
    if (!reason.trim()) {
      setError('Return reason is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    const response = await fetch('/api/returns', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({
        saleId,
        idempotencyKey: crypto.randomUUID(),
        reason,
        restockDecision,
        refundMethod,
        refundAmount: Number(refundAmount || 0),
        items: selectedItems,
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'The return could not be created.');
      setSubmitting(false);
      return;
    }
    const body = (await response.json()) as { data: { return_id: string } };
    setSubmitting(false);
    navigate(`/app/returns/${body.data.return_id}`);
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Returns"
        title="Create Return"
        description="Return sale items and record an authorized refund"
      />
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Find sale</h2>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Receipt or customer
            </span>
            <span className="relative block">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={receiptSearch}
                onChange={(event) => setReceiptSearch(event.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm"
              />
            </span>
          </label>
          {sales.isPending ? (
            <LoadingState label="Searching sales" />
          ) : sales.isError ? (
            <ErrorState onRetry={() => void sales.refetch()} />
          ) : rows.length ? (
            <div className="mt-4 space-y-2">
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => setSaleId(row.id)}
                  className={`w-full rounded-lg border p-3 text-left ${saleId === row.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className="block font-semibold text-slate-800">{row.receipt_number}</span>
                  <span className="text-xs text-slate-500">
                    {row.customer_name || 'Customer'} · {String(row.fulfillment_status)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No matching sales"
              description="Search by receipt or customer information."
            />
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Return details</h2>
          {!saleId ? (
            <p className="mt-4 text-sm text-slate-500">Select a sale to load returnable items.</p>
          ) : sale.isPending ? (
            <LoadingState label="Loading sale items" />
          ) : sale.isError ? (
            <ErrorState onRetry={() => void sale.refetch()} />
          ) : (
            <>
              <div className="mt-4 space-y-2">
                {saleItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {item.product_name_snapshot}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.sku_snapshot} · Sold {String(item.quantity)}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={Number(item.quantity)}
                      step="1"
                      value={quantities[item.id] || ''}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [item.id]: Math.max(
                            0,
                            Math.min(
                              Number(item.quantity),
                              Math.floor(Number(event.target.value) || 0),
                            ),
                          ),
                        }))
                      }
                      className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Return reason
                  </span>
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Restock decision
                  </span>
                  <select
                    value={restockDecision}
                    onChange={(event) =>
                      setRestockDecision(event.target.value as 'restock' | 'discard')
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  >
                    <option value="restock">Restock items</option>
                    <option value="discard">Discard / damaged</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Refund method
                  </span>
                  <select
                    value={refundMethod}
                    onChange={(event) => setRefundMethod(event.target.value as typeof refundMethod)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="mobile_money">Mobile money</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Refund amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  disabled={submitting || !selectedItems.length}
                  onClick={() => void submit()}
                  className="bg-blue-600 text-white"
                >
                  <RotateCcw size={16} className="mr-2" />{' '}
                  {submitting ? 'Processing...' : 'Process return'}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
