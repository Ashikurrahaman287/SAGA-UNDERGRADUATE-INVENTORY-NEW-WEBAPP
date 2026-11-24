import { Plus, Search, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import type { Seller } from './supplier-types';
function money(value: number | string, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
}
export function SellerListPage(): ReactElement {
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ['sellers', search],
    queryFn: () =>
      apiFetch<{ data: { items: Seller[]; total: number }; requestId: string }>(
        `/api/sellers?active=true&search=${encodeURIComponent(search)}`,
      ),
  });
  async function create(): Promise<void> {
    setSaving(true);
    const response = await fetch('/api/sellers', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      setName('');
      setShowForm(false);
      await query.refetch();
    }
    setSaving(false);
  }
  const sellers = query.data?.data.data.items || [];
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Relationships"
        title="Sellers & Operators"
        description="Manage business records used for sales attribution."
        actions={
          <Button onClick={() => setShowForm(true)} className="bg-blue-600 text-white">
            <Plus size={16} className="mr-2" /> Add seller
          </Button>
        }
      />
      {showForm && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Add seller/operator</h2>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Seller/operator name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => setShowForm(false)}
              className="border border-slate-300 bg-white text-slate-700"
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !name.trim()}
              onClick={() => void create()}
              className="bg-blue-600 text-white"
            >
              {saving ? 'Saving...' : 'Create seller'}
            </Button>
          </div>
        </div>
      )}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <Search size={17} className="text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sellers/operators"
          className="flex-1 text-sm outline-none"
        />
      </div>
      {query.isPending ? (
        <LoadingState label="Loading sellers" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : sellers.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Seller</th>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3">Total sales</th>
                <th className="px-5 py-3">Sales value</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sellers.map((seller) => (
                <tr key={seller.id}>
                  <td className="px-5 py-4">
                    <Link
                      to={`/app/sellers/${seller.id}`}
                      className="flex items-center gap-2 font-semibold text-blue-700"
                    >
                      <UserRound size={16} />
                      {seller.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-500">{seller.reference_code || '—'}</td>
                  <td className="px-5 py-4 text-slate-700">{seller.total_sales || 0}</td>
                  <td className="px-5 py-4 text-slate-700">
                    {money(seller.sales_value || 0, currency)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No sellers found"
          description="Create a seller/operator record for future sales attribution."
        />
      )}
    </PageContainer>
  );
}
