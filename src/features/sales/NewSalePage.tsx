import {
  Check,
  CreditCard,
  LoaderCircle,
  MapPin,
  PackageSearch,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { formatMinorUnits, parseMinorUnits } from '../../lib/utils/money';
import { useAuth } from '../auth/use-auth';
import type { SaleCartItem, SaleCustomer, SaleProduct, SaleSeller } from './sale-types';
import { SaleCart } from './SaleCart';

export function NewSalePage(): ReactElement {
  const auth = useAuth();
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [cart, setCart] = useState<SaleCartItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState('0');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other'
  >('cash');
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentReference, setPaymentReference] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);

  const products = useQuery({
    queryKey: ['sale-products', productSearch],
    queryFn: () =>
      apiFetch<{ data: { items: SaleProduct[] }; requestId: string }>(
        `/api/products?active=true&page=1&pageSize=20&search=${encodeURIComponent(productSearch)}`,
      ),
  });
  const customers = useQuery({
    queryKey: ['sale-customers', customerSearch],
    queryFn: () =>
      apiFetch<{ data: { items: SaleCustomer[] }; requestId: string }>(
        `/api/customers?active=true&page=1&pageSize=20&search=${encodeURIComponent(customerSearch)}`,
      ),
  });
  const sellers = useQuery({
    queryKey: ['sale-sellers'],
    queryFn: () =>
      apiFetch<{ data: { items: SaleSeller[] }; requestId: string }>(
        '/api/sellers?active=true&page=1&pageSize=100',
      ),
  });

  const subtotalMinor = cart.reduce(
    (total, item) => total + item.unitPriceMinor * item.quantity,
    0,
  );
  const discountInputMinor = discountType === 'fixed' ? parseMinorUnits(discountValue || '0') : 0;
  const percentageDiscountMinor =
    discountType === 'percentage'
      ? Math.round(subtotalMinor * (Number(discountValue || 0) / 100))
      : 0;
  const discountMinor = Math.min(
    subtotalMinor,
    discountType === 'fixed' ? discountInputMinor : percentageDiscountMinor,
  );
  const feeMinor = parseMinorUnits(deliveryFee || '0');
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + feeMinor);
  const paidMinor = Math.min(totalMinor, parseMinorUnits(amountPaid || '0'));
  const dueMinor = totalMinor - paidMinor;
  const formatMoney = (minor: number) =>
    formatMinorUnits(minor, auth.session?.organization.currency || 'USD');

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  function addProduct(product: SaleProduct): void {
    const stock = Number(product.quantity);
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing)
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: Math.min(stock, item.quantity + 1) }
            : item,
        );
      if (stock < 1) return current;
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitPriceMinor: parseMinorUnits(product.selling_price),
        },
      ];
    });
  }

  function setQuantity(productId: string, quantity: number): void {
    const product = products.data?.data.data.items.find((item) => item.id === productId);
    if (!product) return;
    const stock = Number(product.quantity);
    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.max(1, Math.min(stock, quantity)) }
          : item,
      ),
    );
  }

  async function completeSale(): Promise<void> {
    if (!cart.length) {
      setError('Add at least one product to the cart.');
      return;
    }
    setSubmitting(true);
    setError('');
    const response = await fetch('/api/sales', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({
        idempotencyKey,
        customerId: customerId || null,
        sellerId: sellerId || null,
        discountType,
        discountValue: Number(discountValue || 0),
        deliveryFee: Number(deliveryFee || 0),
        paymentMethod,
        amountPaid: Number(amountPaid || 0),
        paymentReference: paymentReference || undefined,
        deliveryAddressSnapshot:
          addressLine || addressCity
            ? { addressLine: addressLine || 'Pickup', city: addressCity || 'Local' }
            : null,
        deliveryScheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        notes: notes || undefined,
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'The sale could not be created.');
      setSubmitting(false);
      return;
    }
    const body = (await response.json()) as { data: Record<string, unknown> };
    setReceipt(body.data);
    setSubmitting(false);
  }

  if (receipt)
    return (
      <SaleReceipt
        receipt={receipt}
        onAnotherSale={() => {
          setReceipt(null);
          setCart([]);
          setAmountPaid('0');
          setNotes('');
        }}
      />
    );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sales workspace"
        title="New Sale"
        description="Create a customer order and process a new sale"
      />
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr_1.1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <PackageSearch size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">Products</h2>
          </div>
          <input
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Search name or SKU"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          {products.isPending ? (
            <LoadingState label="Loading products" />
          ) : products.isError ? (
            <ErrorState onRetry={() => void products.refetch()} />
          ) : products.data?.data.data.items.length ? (
            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {products.data.data.data.items
                .filter((product) => product.is_active)
                .map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => addProduct(product)}
                    disabled={Number(product.quantity) < 1}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {product.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {product.sku} · {formatMoney(parseMinorUnits(product.selling_price))} ·
                        stock {product.quantity}
                      </span>
                    </span>
                    <span className="ml-3 rounded-lg bg-blue-600 p-2 text-white">
                      <Check size={15} />
                    </span>
                  </button>
                ))}
            </div>
          ) : (
            <EmptyState title="No products found" description="Try another product name or SKU." />
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">Cart</h2>
          </div>
          <SaleCart
            items={cart}
            onQuantity={setQuantity}
            onRemove={(productId) =>
              setCart((current) => current.filter((item) => item.productId !== productId))
            }
            formatMoney={formatMoney}
          />
          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
            <SummaryRow label="Subtotal" value={formatMoney(subtotalMinor)} />
            <SummaryRow label="Discount" value={`-${formatMoney(discountMinor)}`} />
            <SummaryRow label="Delivery fee" value={formatMoney(feeMinor)} />
            <SummaryRow label="Total" value={formatMoney(totalMinor)} strong />
            <SummaryRow label="Amount paid" value={formatMoney(paidMinor)} />
            <SummaryRow label="Amount due" value={formatMoney(dueMinor)} strong />
          </div>
        </section>
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">Sale information</h2>
          </div>
          <Field label="Customer search">
            <input
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Name, phone, or email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">No customer selected</option>
            {customers.data?.data.data.items.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.phone}
              </option>
            ))}
          </select>
          <Field label="Seller attribution">
            <select
              value={sellerId}
              onChange={(event) => setSellerId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">No seller</option>
              {sellers.data?.data.data.items.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                  {seller.reference_code ? ` · ${seller.reference_code}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount type">
              <select
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value as 'fixed' | 'percentage')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value="fixed">Fixed amount</option>
                <option value="percentage">Percentage</option>
              </select>
            </Field>
            <Field label={discountType === 'fixed' ? 'Discount amount' : 'Discount percent'}>
              <input
                type="number"
                min="0"
                max={discountType === 'percentage' ? '100' : undefined}
                step="0.01"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </Field>
          </div>
          <Field label="Delivery fee">
            <input
              type="number"
              min="0"
              step="0.01"
              value={deliveryFee}
              onChange={(event) => setDeliveryFee(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment method">
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="mobile_money">Mobile money</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Amount paid">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(event) => setAmountPaid(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </Field>
          </div>
          <Field label="Payment reference">
            <input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MapPin size={16} /> Delivery details
            </div>
            <div className="grid gap-3">
              <input
                value={addressLine}
                onChange={(event) => setAddressLine(event.target.value)}
                placeholder="Address line"
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
              <input
                value={addressCity}
                onChange={(event) => setAddressCity(event.target.value)}
                placeholder="City"
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <Field label="Sale notes">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Button
            disabled={submitting || !cart.length}
            onClick={() => void completeSale()}
            className="w-full bg-blue-600 text-white"
          >
            {submitting ? (
              <LoaderCircle size={17} className="mr-2 animate-spin" />
            ) : (
              <CreditCard size={17} className="mr-2" />
            )}{' '}
            {submitting ? 'Creating sale...' : 'Complete sale'}
          </Button>
        </section>
      </div>
    </PageContainer>
  );
}
function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
function SummaryRow({
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
function SaleReceipt({
  receipt,
  onAnotherSale,
}: {
  receipt: Record<string, unknown>;
  onAnotherSale: () => void;
}): ReactElement {
  const sale = receipt as Record<string, unknown>;
  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        <div className="border-b border-slate-200 pb-5 text-center">
          <p className="text-xs font-bold tracking-[0.18em] text-blue-700">SAGA INVENTORY</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sale receipt</h1>
          <p className="mt-2 text-sm text-slate-500">Receipt {String(sale.receipt_number)}</p>
        </div>
        <div className="py-6 text-sm">
          <SummaryRow label="Subtotal" value={String(sale.subtotal)} />
          <SummaryRow label="Discount" value={String(sale.discount_amount)} />
          <SummaryRow label="Delivery fee" value={String(sale.delivery_fee)} />
          <SummaryRow label="Total" value={String(sale.total_amount)} strong />
          <SummaryRow label="Amount paid" value={String(sale.amount_paid)} />
          <SummaryRow label="Amount due" value={String(sale.amount_due)} strong />
        </div>
        <div className="flex gap-3 print:hidden">
          <Button
            onClick={() => window.print()}
            className="border border-slate-300 bg-white text-slate-700"
          >
            Print receipt
          </Button>
          <Button onClick={onAnotherSale} className="bg-blue-600 text-white">
            Create another sale
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
