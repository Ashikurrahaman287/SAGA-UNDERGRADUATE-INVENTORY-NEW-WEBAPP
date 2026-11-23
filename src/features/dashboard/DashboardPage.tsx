import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock3,
  DollarSign,
  Package,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import type { DashboardResponse, DashboardSummary, DashboardMoney } from './dashboard-types';

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last-month' | 'year' | 'custom';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function shift(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function presetRange(preset: Preset): { from?: string; to?: string } {
  const today = new Date();
  const current = isoDate(today);
  if (preset === 'today') return { from: current, to: current };
  if (preset === 'yesterday') {
    const value = isoDate(shift(today, -1));
    return { from: value, to: value };
  }
  if (preset === '7d') return { from: isoDate(shift(today, -6)), to: current };
  if (preset === '30d') return { from: isoDate(shift(today, -29)), to: current };
  if (preset === 'month') return { from: `${current.slice(0, 7)}-01`, to: current };
  if (preset === 'last-month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: isoDate(first), to: isoDate(last) };
  }
  if (preset === 'year') return { from: `${today.getFullYear()}-01-01`, to: current };
  return {};
}
function money(value: DashboardMoney | null, currency = 'USD'): string {
  if (value === null) return 'Unavailable';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Unavailable';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(parsed);
}
function quantity(value: DashboardMoney): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(value));
}
function statusLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DashboardPage(): ReactElement {
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range =
    preset === 'custom'
      ? { from: customFrom || undefined, to: customTo || undefined }
      : presetRange(preset);
  const query = useQuery({
    queryKey: ['dashboard-summary', range.from, range.to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      return apiFetch<DashboardResponse>(
        `/api/dashboard/summary${params.size ? `?${params}` : ''}`,
      );
    },
    staleTime: 30_000,
  });
  const summary = query.data?.data.data;
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Admin overview"
        title="Dashboard"
        description="Business overview and performance"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
              <CalendarDays size={16} />
              <span className="sr-only">Date range</span>
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as Preset)}
                className="bg-transparent font-semibold outline-none"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="month">This month</option>
                <option value="last-month">Last month</option>
                <option value="year">This year</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            <Button
              onClick={() => void query.refetch()}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {summary
            ? `Business timezone: ${summary.period.timezone}`
            : 'Metrics are calculated from persisted records.'}
        </span>
        {query.data?.requestId && (
          <span className="flex items-center gap-1">
            <Clock3 size={14} /> Request updated just now
          </span>
        )}
      </div>
      {preset === 'custom' && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <DateInput label="From" value={customFrom} onChange={setCustomFrom} />
          <DateInput label="To" value={customTo} onChange={setCustomTo} />
        </div>
      )}
      {query.isPending && <DashboardLoading />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {summary && <DashboardContent summary={summary} />}
    </PageContainer>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-blue-900">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
      />
    </label>
  );
}
function DashboardLoading(): ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}
function DashboardContent({ summary }: { summary: DashboardSummary }): ReactElement {
  const kpi = summary.kpis;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<ShoppingCart />}
          label="Total sales"
          value={quantity(kpi.salesCount)}
          detail={money(kpi.salesValue)}
          href="/app/sales/history"
          tone="blue"
        />
        <Kpi
          icon={<DollarSign />}
          label="Revenue"
          value={money(kpi.revenue)}
          detail="Recognized valid sales value"
          href="/app/sales/history"
          tone="green"
        />
        <Kpi
          icon={<Wallet />}
          label="Payments due"
          value={money(kpi.paymentsDue)}
          detail="Outstanding sale balances"
          href="/app/payments"
          tone="amber"
        />
        <Kpi
          icon={<TrendingUp />}
          label="Gross profit"
          value={money(kpi.grossProfit)}
          detail={kpi.grossProfit === null ? 'Cost data unavailable' : 'Revenue less item cost'}
          href="/app/reports"
          tone="violet"
        />
        <Kpi
          icon={<Package />}
          label="Stock value"
          value={money(kpi.stockValue)}
          detail="Current quantity × cost price"
          href="/app/inventory"
          tone="blue"
        />
        <Kpi
          icon={<AlertTriangle />}
          label="Low stock"
          value={quantity(kpi.lowStockCount)}
          detail="Products below threshold"
          href="/app/inventory"
          tone="red"
        />
        <Kpi
          icon={<RotateCcw />}
          label="Returns"
          value={quantity(kpi.returnCount)}
          detail={money(kpi.returnValue)}
          href="/app/returns"
          tone="amber"
        />
        <Kpi
          icon={<BarChart3 />}
          label="Net profit"
          value={money(kpi.netProfit)}
          detail="Accounting inputs required"
          href="/app/accounting"
          tone="slate"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel title="Sales and revenue trend" description="Valid sales grouped by business day">
          <TrendChart items={summary.salesTrend} />
        </Panel>
        <Panel title="Payment overview" description="Persisted sale payment states">
          <Breakdown
            items={summary.paymentOverview.map((item) => ({
              label: statusLabel(item.payment_status),
              value: item.order_count,
              detail: money(item.amount),
            }))}
          />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Fulfillment overview" description="Valid orders by current fulfillment stage">
          <Breakdown
            items={summary.fulfillmentOverview.map((item) => ({
              label: statusLabel(item.fulfillment_status),
              value: item.order_count,
            }))}
            empty="No orders in this period."
          />
        </Panel>
        <Panel title="Top-selling products" description="Quantity sold from valid sale items">
          <TopProducts items={summary.topProducts} />
        </Panel>
      </div>
      <PageSection
        title="Low-stock products"
        description="The first products at or below their configured threshold."
      >
        <LowStockTable items={summary.lowStockProducts} />
      </PageSection>
    </>
  );
}
function Kpi({
  icon,
  label,
  value,
  detail,
  href,
  tone,
}: {
  icon: ReactElement;
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: string;
}): ReactElement {
  const toneClass =
    {
      blue: 'bg-blue-50 text-blue-700',
      green: 'bg-green-50 text-green-700',
      amber: 'bg-amber-50 text-amber-700',
      violet: 'bg-violet-50 text-violet-700',
      red: 'bg-red-50 text-red-700',
      slate: 'bg-slate-100 text-slate-700',
    }[tone] || 'bg-blue-50 text-blue-700';
  return (
    <Link
      to={href}
      className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
        {icon}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
      <ArrowUpRight
        size={15}
        className="mt-3 text-slate-300 transition-colors group-hover:text-blue-600"
      />
    </Link>
  );
}
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactElement;
}): ReactElement {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}
function TrendChart({ items }: { items: DashboardSummary['salesTrend'] }): ReactElement {
  if (!items.length)
    return (
      <EmptyState
        title="No sales in this period"
        description="When valid sales are recorded, the daily trend will appear here."
      />
    );
  const max = Math.max(...items.map((item) => Number(item.revenue)), 1);
  return (
    <div className="flex h-56 items-end gap-2 overflow-x-auto pb-6">
      {items.map((item) => (
        <div
          key={item.day}
          className="group flex min-w-8 flex-1 flex-col items-center justify-end gap-2"
        >
          <div
            className="relative w-full rounded-t-md bg-blue-100 transition-colors group-hover:bg-blue-500"
            style={{ height: `${Math.max(4, (Number(item.revenue) / max) * 170)}px` }}
            title={`${item.day}: ${money(item.revenue)}`}
          />
          <span className="text-[10px] text-slate-400">{item.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
function Breakdown({
  items,
  empty = 'No recorded data in this period.',
}: {
  items: Array<{ label: string; value: number; detail?: string }>;
  empty?: string;
}): ReactElement {
  if (!items.length) return <p className="py-10 text-center text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-900">{item.detail || item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function TopProducts({ items }: { items: DashboardSummary['topProducts'] }): ReactElement {
  if (!items.length)
    return (
      <p className="py-10 text-center text-sm text-slate-500">No product sales in this period.</p>
    );
  return (
    <div className="divide-y divide-slate-100">
      {items.slice(0, 5).map((item) => (
        <Link
          key={`${item.product_id}-${item.sku}`}
          to="/app/products"
          className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-800">
              {item.product_name}
            </span>
            <span className="text-xs text-slate-500">{item.sku}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-semibold text-slate-800">
              {quantity(item.quantity_sold)}
            </span>
            <span className="text-xs text-slate-500">units</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
function LowStockTable({ items }: { items: DashboardSummary['lowStockProducts'] }): ReactElement {
  if (!items.length)
    return (
      <EmptyState
        title="Stock levels look healthy"
        description="No active products are at or below their configured low-stock threshold."
      />
    );
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Product</th>
            <th className="px-5 py-3 font-semibold">SKU</th>
            <th className="px-5 py-3 font-semibold">Current stock</th>
            <th className="px-5 py-3 font-semibold">Threshold</th>
            <th className="px-5 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-5 py-3 font-semibold text-slate-800">{item.product_name}</td>
              <td className="px-5 py-3 text-slate-500">{item.sku}</td>
              <td className="px-5 py-3 text-slate-700">
                {quantity(item.quantity)} {item.unit}
              </td>
              <td className="px-5 py-3 text-slate-700">{quantity(item.low_stock_threshold)}</td>
              <td className="px-5 py-3">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Restock needed
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
