import { ArrowLeft, Edit3, History, PackagePlus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import { permissions } from '../../lib/permissions/permission-registry';
import { hasPermission } from '../../lib/permissions/permission-utils';
import type { Category, Product, StockMovement } from './product-types';
import { ActiveBadge, StockStatusBadge } from './ProductStatusBadge';
import { ProductForm } from './ProductForm';

function money(value: number | string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
    Number(value),
  );
}
function quantity(value: number | string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(value));
}
export function ProductDetailPage(): ReactElement {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [actionError, setActionError] = useState('');
  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: () => apiFetch<{ data: Product; requestId: string }>(`/api/products/${id}`),
    enabled: Boolean(id),
  });
  const historyQuery = useQuery({
    queryKey: ['stock-movements', id],
    queryFn: () =>
      apiFetch<{ data: StockMovement[]; requestId: string }>(`/api/products/${id}/stock-movements`),
    enabled: Boolean(id),
  });
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<{ data: Category[]; requestId: string }>('/api/categories'),
  });
  if (productQuery.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading product" />
      </PageContainer>
    );
  if (productQuery.isError || !productQuery.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void productQuery.refetch()} />
      </PageContainer>
    );
  const product = productQuery.data.data.data;
  const canEdit = hasPermission(auth.session?.role, permissions.productsUpdate);
  const canArchive =
    hasPermission(auth.session?.role, permissions.productsArchive) &&
    product.is_active &&
    Number(product.quantity) === 0;
  async function saveProduct(
    values: Parameters<NonNullable<React.ComponentProps<typeof ProductForm>['onSubmit']>>[0],
  ): Promise<void> {
    const changes = {
      name: values.name,
      sku: values.sku,
      description: values.description,
      categoryId: values.categoryId,
      supplierId: values.supplierId,
      costPrice: values.costPrice,
      sellingPrice: values.sellingPrice,
      lowStockThreshold: values.lowStockThreshold,
      unit: values.unit,
      isActive: values.isActive,
    };
    const response = await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify(changes),
    });
    if (!response.ok) throw new Error('The product could not be updated.');
    setEditing(false);
    await productQuery.refetch();
  }
  async function archiveProduct(): Promise<void> {
    if (!window.confirm('Archive this product? It will remain available in history.')) return;
    setActionError('');
    const response = await fetch(`/api/products/${product.id}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': auth.csrfToken },
    });
    if (!response.ok) {
      setActionError(
        'This product cannot be archived while it has available stock or active references.',
      );
      return;
    }
    navigate('/app/products');
  }
  return (
    <PageContainer>
      <Link
        to="/app/products"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
      >
        <ArrowLeft size={16} /> Back to products
      </Link>
      <PageHeader
        eyebrow="Product details"
        title={product.name}
        description={`${product.sku} · ${product.category_name || 'Uncategorized'}`}
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Button
                onClick={() => setEditing((value) => !value)}
                className="border border-slate-300 bg-white text-slate-700"
              >
                <Edit3 size={16} className="mr-2" /> Edit
              </Button>
            )}
            {canArchive && (
              <Button
                onClick={() => void archiveProduct()}
                className="border border-rose-200 bg-white text-rose-700"
              >
                Archive
              </Button>
            )}
            {hasPermission(auth.session?.role, permissions.productsStockAdjust) && (
              <Button onClick={() => setAdjusting(true)} className="bg-blue-600 text-white">
                <PackagePlus size={16} className="mr-2" /> Adjust stock
              </Button>
            )}
          </div>
        }
      />
      {actionError && (
        <p className="mb-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>
      )}
      {editing ? (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <ProductForm
            categories={categoriesQuery.data?.data.data || []}
            canChooseSupplier={auth.session?.role === 'admin'}
            initial={{
              name: product.name,
              sku: product.sku,
              description: product.description || '',
              categoryId: product.category_id,
              supplierId: product.supplier_id,
              costPrice: Number(product.cost_price),
              sellingPrice: Number(product.selling_price),
              lowStockThreshold: Number(product.low_stock_threshold),
              unit: product.unit,
              isActive: product.is_active,
            }}
            onSubmit={saveProduct}
            onCancel={() => setEditing(false)}
            submitting={false}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Cost price" value={money(product.cost_price)} />
          <Info label="Selling price" value={money(product.selling_price)} />
          <Info label="Current stock" value={`${quantity(product.quantity)} ${product.unit}`} />
          <Info label="Low-stock threshold" value={quantity(product.low_stock_threshold)} />
          <div className="flex items-center gap-2">
            <ActiveBadge active={product.is_active} />
            <StockStatusBadge
              status={
                Number(product.quantity) === 0
                  ? 'out_of_stock'
                  : Number(product.quantity) <= Number(product.low_stock_threshold)
                    ? 'low_stock'
                    : 'in_stock'
              }
            />
          </div>
        </div>
      )}
      <PageSection title="Stock history" description="Immutable movements for this product.">
        {historyQuery.isPending ? (
          <LoadingState label="Loading stock history" />
        ) : historyQuery.data?.data.data.length ? (
          <MovementTable movements={historyQuery.data.data.data} />
        ) : (
          <EmptyState
            title="No stock movements"
            description="Opening stock and future adjustments will appear here."
          />
        )}
      </PageSection>
      {adjusting && (
        <StockDialog
          product={product}
          csrfToken={auth.csrfToken}
          onClose={() => setAdjusting(false)}
          onDone={async () => {
            setAdjusting(false);
            await Promise.all([productQuery.refetch(), historyQuery.refetch()]);
          }}
        />
      )}
    </PageContainer>
  );
}
function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-3 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
function MovementTable({ movements }: { movements: StockMovement[] }): ReactElement {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Movement</th>
            <th className="px-5 py-3">Change</th>
            <th className="px-5 py-3">Resulting stock</th>
            <th className="px-5 py-3">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {movements.map((movement) => (
            <tr key={movement.id}>
              <td className="px-5 py-3 text-slate-500">
                {new Date(movement.created_at).toLocaleString()}
              </td>
              <td className="px-5 py-3 font-semibold text-slate-700">
                {movement.movement_type.replaceAll('_', ' ')}
              </td>
              <td className="px-5 py-3 text-slate-700">{quantity(movement.quantity)}</td>
              <td className="px-5 py-3 font-semibold text-slate-800">
                {quantity(movement.new_quantity)}
              </td>
              <td className="px-5 py-3 text-slate-600">{movement.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function StockDialog({
  product,
  csrfToken,
  onClose,
  onDone,
}: {
  product: Product;
  csrfToken: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}): ReactElement {
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const next =
    Number(product.quantity) +
    (direction === 'increase' ? Number(amount || 0) : -Number(amount || 0));
  async function submit(): Promise<void> {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/inventory/adjustments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          productId: product.id,
          direction,
          quantity: Number(amount),
          reason,
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message || 'Stock adjustment failed.');
      }
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock adjustment failed.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Adjust stock</h2>
            <p className="mt-1 text-sm text-slate-500">
              {product.name} · current {quantity(product.quantity)}
            </p>
          </div>
          <History size={20} className="text-blue-600" />
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Adjustment type</span>
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as 'increase' | 'decrease')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="increase">Increase stock</option>
              <option value="decrease">Decrease stock</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Quantity</span>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Reason *</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </label>
          <div
            className={`rounded-lg px-3 py-2 text-sm ${next < 0 ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-800'}`}
          >
            Expected stock: <strong>{quantity(next)}</strong>
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onClose} className="border border-slate-300 bg-white text-slate-700">
            Cancel
          </Button>
          <Button
            disabled={saving || !reason.trim() || Number(amount) <= 0 || next < 0}
            onClick={() => void submit()}
            className="bg-blue-600 text-white"
          >
            {saving ? 'Saving...' : 'Apply adjustment'}
          </Button>
        </div>
      </div>
    </div>
  );
}
