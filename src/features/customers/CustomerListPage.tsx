import { Filter, UserPlus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import { hasPermission } from '../../lib/permissions/permission-utils';
import { permissions } from '../../lib/permissions/permission-registry';
import type { Customer, CustomerListPayload, CustomerMetrics } from './customer-types';
import { CustomerForm } from './CustomerForm';

function money(value: number | string, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
}
export function CustomerListPage(): ReactElement {
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const role = auth.session?.role;
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canCreate = hasPermission(role, permissions.customersCreate);
  const query = useQuery({
    queryKey: ['customers', search, activity, page],
    queryFn: () => {
      const params = new URLSearchParams({ active: 'true', page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (activity) params.set('purchaseActivity', activity);
      return apiFetch<{
        data: CustomerListPayload;
        page: number;
        pageSize: number;
        requestId: string;
      }>(`/api/customers?${params}`);
    },
  });
  const metrics = useQuery({
    queryKey: ['customer-metrics'],
    queryFn: () => apiFetch<{ data: CustomerMetrics; requestId: string }>('/api/customers/summary'),
  });
  async function createCustomer(
    values: Parameters<NonNullable<React.ComponentProps<typeof CustomerForm>['onSubmit']>>[0],
  ): Promise<void> {
    setSaving(true);
    setError('');
    const response = await fetch('/api/customers', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Customer could not be created.');
      setSaving(false);
      return;
    }
    setShowForm(false);
    setSaving(false);
    await Promise.all([query.refetch(), metrics.refetch()]);
  }
  const customers = query.data?.data.data.items || [];
  const total = query.data?.data.data.total || 0;
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        description="Manage customer profiles and relationships."
        actions={
          canCreate ? (
            <Button onClick={() => setShowForm(true)} className="bg-blue-600 text-white">
              <UserPlus size={16} className="mr-2" /> Add customer
            </Button>
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total customers" value={metrics.data?.data.data.totalCustomers ?? '—'} />
        <Metric label="Active customers" value={metrics.data?.data.data.activeCustomers ?? '—'} />
        <Metric label="New in 30 days" value={metrics.data?.data.data.newCustomers ?? '—'} />
        <Metric
          label="With purchases"
          value={metrics.data?.data.data.customersWithPurchases ?? '—'}
        />
      </div>
      {showForm && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold text-slate-900">Add customer</h2>
          {error && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <CustomerForm
            showAddress
            onSubmit={createCustomer}
            onCancel={() => setShowForm(false)}
            submitting={saving}
          />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search name, phone, or email"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
        />
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600">
          <Filter size={15} />
          <select
            value={activity}
            onChange={(event) => {
              setActivity(event.target.value);
              setPage(1);
            }}
            className="bg-transparent py-2.5 outline-none"
          >
            <option value="">All purchase activity</option>
            <option value="with_purchases">With purchases</option>
            <option value="without_purchases">Without purchases</option>
          </select>
        </label>
      </div>
      {query.isPending ? (
        <LoadingState label="Loading customers" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : customers.length ? (
        <CustomerTable customers={customers} currency={currency} />
      ) : (
        <EmptyState
          title="No customers found"
          description="Try another search or add the first customer to this organization."
          action={
            canCreate ? (
              <Button onClick={() => setShowForm(true)} className="bg-blue-600 text-white">
                Add customer
              </Button>
            ) : undefined
          }
        />
      )}
      {total > 20 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {Math.ceil(total / 20)}
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
function Metric({ label, value }: { label: string; value: number | string }): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-3 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
function CustomerTable({
  customers,
  currency,
}: {
  customers: Customer[];
  currency: string;
}): ReactElement {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Customer</th>
            <th className="px-5 py-3">Phone</th>
            <th className="px-5 py-3">Email</th>
            <th className="px-5 py-3">Orders</th>
            <th className="px-5 py-3">Total purchase</th>
            <th className="px-5 py-3">Last purchase</th>
            <th className="px-5 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {customers.map((customer) => (
            <tr key={customer.id} className="hover:bg-slate-50">
              <td className="px-5 py-4">
                <Link
                  to={`/app/customers/${customer.id}`}
                  className="font-semibold text-blue-700 hover:text-blue-900"
                >
                  {customer.name}
                </Link>
              </td>
              <td className="px-5 py-4 text-slate-600">{customer.phone}</td>
              <td className="px-5 py-4 text-slate-600">{customer.email || '—'}</td>
              <td className="px-5 py-4 text-slate-700">{customer.total_orders || 0}</td>
              <td className="px-5 py-4 text-slate-700">
                {money(customer.total_purchase || 0, currency)}
              </td>
              <td className="px-5 py-4 text-slate-500">
                {customer.last_purchase
                  ? new Date(customer.last_purchase).toLocaleDateString()
                  : '—'}
              </td>
              <td className="px-5 py-4">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${customer.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                >
                  {customer.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
