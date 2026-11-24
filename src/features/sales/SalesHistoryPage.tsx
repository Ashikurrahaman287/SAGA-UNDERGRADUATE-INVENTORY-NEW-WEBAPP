import { Filter, RotateCcw, Search } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { apiFetch } from '../../lib/api/client';
import { Button } from '../../components/ui/button';
import { useAuth } from '../auth/use-auth';

type SaleRow = {
  id: string;
  receipt_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  seller_name?: string | null;
  seller_reference?: string | null;
  item_count?: number;
  total_amount: number | string;
  confirmed_paid?: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
};
type SalesSummary = {
  totalSales: number;
  totalSalesValue: number | string;
  amountCollected: number | string;
  outstandingAmount: number | string;
  paidSales: number;
  partiallyPaidSales: number;
  unpaidSales: number;
};

export function SalesHistoryPage(): ReactElement {
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [sort, setSort] = useState('created_at');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const params = new URLSearchParams({ page: String(page), pageSize: '25', sort, direction });
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (customerId) params.set('customerId', customerId);
  if (sellerId) params.set('sellerId', sellerId);
  if (paymentStatus) params.set('paymentStatus', paymentStatus);
  if (fulfillmentStatus) params.set('fulfillmentStatus', fulfillmentStatus);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = useQuery({
    queryKey: ['sales-history', params.toString()],
    queryFn: () =>
      apiFetch<{
        data: SaleRow[];
        total: number;
        summary: SalesSummary | null;
        page: number;
        pageSize: number;
        requestId: string;
      }>(`/api/sales?${params}`),
    placeholderData: (previous) => previous,
  });
  const rows = query.data?.data.data || [];
  const total = query.data?.data.total || 0;
  const summary = query.data?.data.summary;
  function money(value: number | string): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sales"
        title="Sales History"
        description="View and manage recorded sales transactions"
        actions={
          <Button
            onClick={() => setFiltersOpen((open) => !open)}
            className="border border-slate-300 bg-white text-slate-700"
          >
            <Filter size={16} className="mr-2" /> Filters
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total sales" value={String(summary?.totalSales ?? '—')} />
        <SummaryCard label="Sales value" value={summary ? money(summary.totalSalesValue) : '—'} />
        <SummaryCard label="Collected" value={summary ? money(summary.amountCollected) : '—'} />
        <SummaryCard label="Outstanding" value={summary ? money(summary.outstandingAmount) : '—'} />
      </div>
      {summary && (
        <div className="mb-5 flex flex-wrap gap-2 text-xs">
          <StatusCount label="Paid" value={summary.paidSales} />
          <StatusCount label="Partially paid" value={summary.partiallyPaidSales} />
          <StatusCount label="Unpaid" value={summary.unpaidSales} />
        </div>
      )}
      {filtersOpen && (
        <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="From">
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </FilterField>
          <FilterField label="To">
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </FilterField>
          <FilterField label="Payment status">
            <select
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partially paid</option>
              <option value="paid">Paid</option>
            </select>
          </FilterField>
          <FilterField label="Fulfillment">
            <select
              value={fulfillmentStatus}
              onChange={(event) => {
                setFulfillmentStatus(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="packed">Packed</option>
              <option value="ready_for_delivery">Ready for delivery</option>
              <option value="out_for_delivery">Out for delivery</option>
              <option value="delivered">Delivered</option>
            </select>
          </FilterField>
          <FilterField label="Customer ID">
            <input
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setPage(1);
              }}
              placeholder="UUID"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </FilterField>
          <FilterField label="Seller ID">
            <input
              value={sellerId}
              onChange={(event) => {
                setSellerId(event.target.value);
                setPage(1);
              }}
              placeholder="UUID"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </FilterField>
          <div className="flex justify-end sm:col-span-2 lg:col-span-4">
            <Button
              onClick={() => {
                setFrom('');
                setTo('');
                setCustomerId('');
                setSellerId('');
                setPaymentStatus('');
                setFulfillmentStatus('');
                setSearch('');
                setDebouncedSearch('');
                setPage(1);
              }}
              className="border border-slate-300 bg-white text-slate-700"
            >
              <RotateCcw size={16} className="mr-2" /> Reset filters
            </Button>
          </div>
        </div>
      )}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <Search size={17} className="text-slate-400" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search receipt or notes"
          className="flex-1 text-sm outline-none"
        />
      </div>
      <div className="mb-4 flex gap-2">
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="created_at">Date</option>
          <option value="receipt_number">Receipt</option>
          <option value="total_amount">Sale total</option>
          <option value="amount_paid">Amount paid</option>
          <option value="amount_due">Amount due</option>
          <option value="customer_name">Customer</option>
          <option value="payment_status">Payment status</option>
        </select>
        <select
          value={direction}
          onChange={(event) => {
            setDirection(event.target.value as 'asc' | 'desc');
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
      {query.isPending ? (
        <LoadingState label="Loading sales" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Receipt</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Seller</th>
                <th className="px-5 py-3">Items</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Paid</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Payment</th>
                <th className="px-5 py-3">Fulfillment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4">
                    <Link to={`/app/sales/${row.id}`} className="font-semibold text-blue-700">
                      {row.receipt_number}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {row.customer_name || '—'}
                    {row.customer_phone && (
                      <span className="block text-xs text-slate-400">{row.customer_phone}</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {row.seller_name || '—'}
                    {row.seller_reference && (
                      <span className="block text-xs text-slate-400">{row.seller_reference}</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-700">{row.item_count || 0}</td>
                  <td className="px-5 py-4 font-semibold text-slate-800">
                    {money(row.total_amount)}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {money(row.confirmed_paid ?? row.amount_paid)}
                  </td>
                  <td className="px-5 py-4 text-slate-700">{money(row.amount_due)}</td>
                  <td className="px-5 py-4 capitalize text-slate-600">{row.payment_status}</td>
                  <td className="px-5 py-4 capitalize text-slate-600">
                    {row.fulfillment_status.replaceAll('_', ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No sales found"
          description="Valid sales created in this organization will appear here."
        />
      )}
      <Pagination page={page} pageSize={25} total={total} onPage={setPage} />
    </PageContainer>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-3 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
function StatusCount({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600">
      {label}: <strong className="text-slate-900">{value}</strong>
    </span>
  );
}
function FilterField({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}): ReactElement {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          className="border border-slate-300 bg-white text-slate-700"
        >
          Previous
        </Button>
        <Button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="border border-slate-300 bg-white text-slate-700"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
