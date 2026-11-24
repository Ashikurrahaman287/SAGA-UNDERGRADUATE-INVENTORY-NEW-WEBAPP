import { Filter, PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import { permissions } from '../../lib/permissions/permission-registry';
import { hasPermission } from '../../lib/permissions/permission-utils';
import type { Category, Product, ProductListResponse, ProductSummary } from './product-types';
import { ActiveBadge, StockStatusBadge } from './ProductStatusBadge';
import { ProductForm } from './ProductForm';

function money(value: number | string, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
}
function number(value: number | string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(value));
}

export function ProductCatalogPage({
  lowStockOnly = false,
}: {
  lowStockOnly?: boolean;
}): ReactElement {
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const role = auth.session?.role;
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('true');
  const [stockStatus, setStockStatus] = useState(lowStockOnly ? 'low_stock' : '');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canCreate = hasPermission(role, permissions.productsCreate);
  const query = useQuery({
    queryKey: ['products', search, active, stockStatus, page],
    queryFn: () => {
      const params = new URLSearchParams({ active, page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (stockStatus) params.set('stockStatus', stockStatus);
      return apiFetch<ProductListResponse>(`/api/products?${params}`);
    },
  });
  const summary = useQuery({
    queryKey: ['product-summary'],
    queryFn: () => apiFetch<{ data: ProductSummary; requestId: string }>('/api/products/summary'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<{ data: Category[]; requestId: string }>('/api/categories'),
  });
  async function createProduct(
    values: Parameters<NonNullable<React.ComponentProps<typeof ProductForm>['onSubmit']>>[0],
  ): Promise<void> {
    setSubmitting(true);
    setFormError('');
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message || 'Product could not be created.');
      }
      setShowForm(false);
      await Promise.all([query.refetch(), summary.refetch()]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Product could not be created.');
    } finally {
      setSubmitting(false);
    }
  }
  const items = query.data?.data.data.items || [];
  const total = query.data?.data.data.total || 0;
  return (
    <PageContainer>
      <PageHeader
        eyebrow={lowStockOnly ? 'Inventory attention' : 'Catalog'}
        title={lowStockOnly ? 'Stock Management' : 'Products'}
        description={
          lowStockOnly
            ? 'Review products that need a stock decision.'
            : 'Manage your product catalog and inventory.'
        }
        actions={
          canCreate && !lowStockOnly ? (
            <Button onClick={() => setShowForm(true)} className="bg-blue-600 text-white">
              <PackagePlus size={17} className="mr-2" /> Add product
            </Button>
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total products" value={summary.data?.data.data.totalProducts ?? '—'} />
        <SummaryCard
          label="Active products"
          value={summary.data?.data.data.activeProducts ?? '—'}
        />
        <SummaryCard
          label="Out of stock"
          value={summary.data?.data.data.outOfStock ?? '—'}
          tone="rose"
        />
        <SummaryCard
          label="Low stock"
          value={summary.data?.data.data.lowStock ?? '—'}
          tone="amber"
        />
      </div>
      {showForm && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold text-slate-900">Add product</h2>
          {formError && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          )}
          <ProductForm
            categories={categories.data?.data.data || []}
            initial={{ lowStockThreshold: query.data?.data.defaultLowStockThreshold ?? 0 }}
            canChooseSupplier={role === 'admin'}
            onSubmit={createProduct}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
          />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search product name or SKU"
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            <Filter size={15} />
            <select
              value={active}
              onChange={(event) => {
                setActive(event.target.value);
                setPage(1);
              }}
              className="bg-transparent outline-none"
            >
              <option value="true">Active</option>
              <option value="false">Archived</option>
              <option value="all">All status</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            <SlidersHorizontal size={15} />
            <select
              value={stockStatus}
              onChange={(event) => {
                setStockStatus(event.target.value);
                setPage(1);
              }}
              className="bg-transparent outline-none"
            >
              <option value="">All stock</option>
              <option value="in_stock">In stock</option>
              <option value="low_stock">Low stock</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </label>
        </div>
      </div>
      {query.isPending ? (
        <LoadingState label="Loading products" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No products found"
          description="Try adjusting your search or filters, or add the first product to this organization."
          action={
            canCreate && !lowStockOnly ? (
              <Button onClick={() => setShowForm(true)} className="bg-blue-600 text-white">
                Add product
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ProductTable items={items} currency={currency} />
      )}
      {total > 20 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing page {page} of {Math.ceil(total / 20)}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
              className="border border-slate-300 bg-white text-slate-700"
            >
              Previous
            </Button>
            <Button
              disabled={page >= Math.ceil(total / 20)}
              onClick={() => setPage((value) => value + 1)}
              className="border border-slate-300 bg-white text-slate-700"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
function SummaryCard({
  label,
  value,
  tone = 'blue',
}: {
  label: string;
  value: number | string;
  tone?: string;
}): ReactElement {
  const toneClass =
    tone === 'rose'
      ? 'text-rose-700 bg-rose-50'
      : tone === 'amber'
        ? 'text-amber-700 bg-amber-50'
        : 'text-blue-700 bg-blue-50';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`mt-3 inline-flex rounded-lg px-2.5 py-1 text-xl font-semibold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
function ProductTable({ items, currency }: { items: Product[]; currency: string }): ReactElement {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Product</th>
            <th className="px-5 py-3">SKU</th>
            <th className="px-5 py-3">Category</th>
            <th className="px-5 py-3">Supplier</th>
            <th className="px-5 py-3">Cost</th>
            <th className="px-5 py-3">Selling</th>
            <th className="px-5 py-3">Stock</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((product) => (
            <tr key={product.id} className="hover:bg-slate-50">
              <td className="px-5 py-4">
                <Link
                  to={`/app/products/${product.id}`}
                  className="font-semibold text-slate-800 hover:text-blue-700"
                >
                  {product.name}
                </Link>
              </td>
              <td className="px-5 py-4 text-slate-500">{product.sku}</td>
              <td className="px-5 py-4 text-slate-600">
                {product.category_name || 'Uncategorized'}
              </td>
              <td className="px-5 py-4 text-slate-600">{product.supplier_name || '—'}</td>
              <td className="px-5 py-4 text-slate-700">{money(product.cost_price, currency)}</td>
              <td className="px-5 py-4 text-slate-700">{money(product.selling_price, currency)}</td>
              <td className="px-5 py-4 font-semibold text-slate-800">
                {number(product.quantity)} {product.unit}
              </td>
              <td className="px-5 py-4">
                <div className="flex flex-col items-start gap-2">
                  <ActiveBadge active={product.is_active} />
                  <StockStatusBadge status={product.stock_status} />
                </div>
              </td>
              <td className="px-5 py-4">
                <Link
                  to={`/app/products/${product.id}`}
                  className="font-semibold text-blue-700 hover:text-blue-900"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
