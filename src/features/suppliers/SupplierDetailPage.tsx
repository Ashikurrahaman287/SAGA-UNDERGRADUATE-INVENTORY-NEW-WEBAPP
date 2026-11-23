import { ArrowLeft, Edit3, Package, Save } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import type { Supplier } from './supplier-types';
export function SupplierDetailPage(): ReactElement {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const supplier = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => apiFetch<{ data: Supplier; requestId: string }>(`/api/suppliers/${id}`),
    enabled: Boolean(id),
  });
  const products = useQuery({
    queryKey: ['supplier-products', id],
    queryFn: () =>
      apiFetch<{
        data: Array<{
          id: string;
          name: string;
          sku: string;
          quantity: number | string;
          cost_price: number | string;
          selling_price: number | string;
          is_active: boolean;
        }>;
        requestId: string;
      }>(`/api/suppliers/${id}/products`),
    enabled: Boolean(id),
  });
  if (supplier.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading supplier" />
      </PageContainer>
    );
  if (supplier.isError || !supplier.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void supplier.refetch()} />
      </PageContainer>
    );
  const item = supplier.data.data.data;
  async function save(): Promise<void> {
    const response = await fetch(`/api/suppliers/${item.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ name, phone }),
    });
    if (response.ok) {
      setEditing(false);
      await supplier.refetch();
    }
  }
  async function archive(): Promise<void> {
    if (!window.confirm('Archive this supplier? Existing product links will remain readable.'))
      return;
    const response = await fetch(`/api/suppliers/${item.id}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': auth.csrfToken },
    });
    if (response.ok) navigate('/app/suppliers');
  }
  return (
    <PageContainer>
      <Link
        to="/app/suppliers"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
      >
        <ArrowLeft size={16} /> Back to suppliers
      </Link>
      <PageHeader
        eyebrow="Supplier details"
        title={item.name}
        description={item.reference_code || 'Supplier relationship'}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setName(item.name);
                setPhone(item.phone || '');
                setEditing((value) => !value);
              }}
              className="border border-slate-300 bg-white text-slate-700"
            >
              <Edit3 size={16} className="mr-2" /> Edit
            </Button>
            {item.is_active && (
              <Button
                onClick={() => void archive()}
                className="border border-rose-200 bg-white text-rose-700"
              >
                Archive
              </Button>
            )}
          </div>
        }
      />
      {editing && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => void save()} className="bg-blue-600 text-white">
              <Save size={16} className="mr-2" /> Save changes
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Contact person" value={item.contact_person || '—'} />
        <Info label="Phone" value={item.phone || '—'} />
        <Info label="Email" value={item.email || '—'} />
        <Info label="Status" value={item.is_active ? 'Active' : 'Archived'} />
      </div>
      <PageSection
        title="Linked products"
        description="Existing product links remain readable after supplier archival."
      >
        {products.data?.data.data.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Cost</th>
                  <th className="px-5 py-3">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.data.data.data.map((product) => (
                  <tr key={product.id}>
                    <td className="px-5 py-4">
                      <Link
                        to={`/app/products/${product.id}`}
                        className="font-semibold text-blue-700"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{product.sku}</td>
                    <td className="px-5 py-4 text-slate-700">{product.cost_price}</td>
                    <td className="px-5 py-4 text-slate-700">{product.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No linked products"
            description="Products assigned to this supplier will appear here."
          />
        )}
      </PageSection>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Package size={16} /> Supplier records are organization-scoped.
      </div>
    </PageContainer>
  );
}
function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
