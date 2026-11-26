import { ArrowLeft, Edit3, Save, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import type { Seller } from './supplier-types';
export function SellerDetailPage(): ReactElement {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const seller = useQuery({
    queryKey: ['seller', id],
    queryFn: () => apiFetch<{ data: Seller; requestId: string }>(`/api/sellers/${id}`),
    enabled: Boolean(id),
  });
  const sales = useQuery({
    queryKey: ['seller-sales', id],
    queryFn: () =>
      apiFetch<{
        data: Array<{
          id: string;
          receipt_number: string;
          total_amount: number | string;
          payment_status: string;
          fulfillment_status: string;
          created_at: string;
          customers?: { name?: string } | null;
        }>;
        requestId: string;
      }>(`/api/sellers/${id}/sales`),
    enabled: Boolean(id),
  });
  if (seller.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading seller" />
      </PageContainer>
    );
  if (seller.isError || !seller.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void seller.refetch()} />
      </PageContainer>
    );
  const item = seller.data.data.data;
  async function save(): Promise<void> {
    const response = await fetch(`/api/sellers/${item.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      setEditing(false);
      await seller.refetch();
    }
  }
  async function archive(): Promise<void> {
    if (!window.confirm('Archive this seller/operator? Historical attribution will remain intact.'))
      return;
    const response = await fetch(`/api/sellers/${item.id}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': auth.csrfToken },
    });
    if (response.ok) navigate('/app/sellers');
  }
  return (
    <PageContainer>
      <Link
        to="/app/sellers"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
      >
        <ArrowLeft size={16} /> Back to sellers
      </Link>
      <PageHeader
        eyebrow="Business record"
        title={item.name}
        description="Seller/operator attribution record, not an authentication role."
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setName(item.name);
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
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <Button onClick={() => void save()} className="bg-blue-600 text-white">
              <Save size={16} className="mr-2" /> Save
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Info label="Reference" value={item.reference_code || '—'} />
        <Info label="Phone" value={item.phone || '—'} />
        <Info label="Status" value={item.is_active ? 'Active' : 'Archived'} />
      </div>
      <PageSection
        title="Attributed sales"
        description="Valid sales only; seller attribution is preserved historically."
      >
        {sales.data?.data.data.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Receipt</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.data.data.data.map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-5 py-4 font-semibold text-blue-700">{sale.receipt_number}</td>
                    <td className="px-5 py-4 text-slate-500">
                      {new Date(sale.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{sale.customers?.name || '—'}</td>
                    <td className="px-5 py-4 text-slate-700">{sale.total_amount}</td>
                    <td className="px-5 py-4 capitalize text-slate-600">{sale.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No attributed sales"
            description="New Sale can attribute orders to this seller for reporting."
          />
        )}
      </PageSection>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <UserRound size={16} /> This record never creates a login account.
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
