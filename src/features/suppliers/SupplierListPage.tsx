import { Plus, Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import type { Supplier } from './supplier-types';
export function SupplierListPage(): ReactElement {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () =>
      apiFetch<{ data: { items: Supplier[]; total: number }; requestId: string }>(
        `/api/suppliers?active=true&search=${encodeURIComponent(search)}`,
      ),
  });
  async function create(): Promise<void> {
    setSaving(true);
    const response = await fetch('/api/suppliers', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ name, phone }),
    });
    if (response.ok) {
      setName('');
      setPhone('');
      setShowForm(false);
      await query.refetch();
    }
    setSaving(false);
  }
  const suppliers = query.data?.data.data.items || [];
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Relationships"
        title="Suppliers"
        description="Manage supplier relationships and contact information."
        actions={
          <Button onClick={() => setShowForm(true)} className="bg-blue-600 text-white">
            <Plus size={16} className="mr-2" /> Add supplier
          </Button>
        }
      />
      {showForm && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Add supplier</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Supplier name"
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Primary phone"
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => setShowForm(false)}
              className="border border-slate-300 bg-white text-slate-700"
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !name.trim() || !phone.trim()}
              onClick={() => void create()}
              className="bg-blue-600 text-white"
            >
              {saving ? 'Saving...' : 'Create supplier'}
            </Button>
          </div>
        </div>
      )}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <Search size={17} className="text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search suppliers"
          className="flex-1 text-sm outline-none"
        />
      </div>
      {query.isPending ? (
        <LoadingState label="Loading suppliers" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : suppliers.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Products</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="px-5 py-4">
                    <Link
                      to={`/app/suppliers/${supplier.id}`}
                      className="font-semibold text-blue-700"
                    >
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{supplier.contact_person || '—'}</td>
                  <td className="px-5 py-4 text-slate-600">{supplier.phone}</td>
                  <td className="px-5 py-4 text-slate-700">{supplier.product_count || 0}</td>
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
          title="No suppliers found"
          description="Create the first supplier relationship for this organization."
        />
      )}
    </PageContainer>
  );
}
