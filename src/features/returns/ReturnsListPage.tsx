import { Plus, Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

type ReturnRow = {
  id: string;
  sale_id: string;
  return_number: string;
  reason: string;
  status: string;
  restock_decision: string;
  total_amount: number | string;
  created_at: string;
  sales?: { receipt_number?: string; customers?: { name?: string } } | null;
};

export function ReturnsListPage(): ReactElement {
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const query = useQuery({
    queryKey: ['returns', params.toString()],
    queryFn: () =>
      apiFetch<{
        data: ReturnRow[];
        total: number;
        page: number;
        pageSize: number;
        requestId: string;
      }>(`/api/returns?${params}`),
  });
  const rows = query.data?.data.data || [];
  const total = query.data?.data.total || 0;
  const money = (value: number | string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Returns"
        title="Returns & Refunds"
        description="Process and review authorized customer returns"
        actions={
          <Link
            to="/app/returns/new"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} className="mr-2" /> Create return
          </Link>
        }
      />
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <label className="relative flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Return number or reason"
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="requested">Requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="processed">Processed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {query.isPending ? (
        <LoadingState label="Loading returns" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Return</th>
                  <th className="px-5 py-3">Sale</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Restock</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
                  const customer =
                    sale?.customers && Array.isArray(sale.customers)
                      ? sale.customers[0]
                      : sale?.customers;
                  return (
                    <tr key={row.id}>
                      <td className="px-5 py-4">
                        <Link to={`/app/returns/${row.id}`} className="font-semibold text-blue-700">
                          {row.return_number}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {sale?.receipt_number || '—'}
                        {customer?.name && (
                          <span className="block text-xs text-slate-400">{customer.name}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.reason}</td>
                      <td className="px-5 py-4 capitalize text-slate-600">
                        {row.restock_decision}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        {money(row.total_amount)}
                      </td>
                      <td className="px-5 py-4 capitalize text-slate-600">{row.status}</td>
                      <td className="px-5 py-4 text-slate-500">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {page} of {Math.max(1, Math.ceil(total / 25))}
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
                disabled={page >= Math.ceil(total / 25)}
                onClick={() => setPage((value) => value + 1)}
                className="border border-slate-300 bg-white text-slate-700"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="No returns found"
          description="Authorized returns and refunds will appear here."
        />
      )}
    </PageContainer>
  );
}
