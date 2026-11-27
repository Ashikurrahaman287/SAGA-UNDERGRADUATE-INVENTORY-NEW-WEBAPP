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
  const currency = summary?.currency || 'USD';
  return (
    <PageContainer className="max-w-[1600px] px-4 py-6 sm:px-7 lg:px-8">
      <PageHeader
        eyebrow="  Welcome back"
        title="Dashboard"
        description="Track your business performance at a glance."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-slate-600 shadow-sm">
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
              className="h-10 rounded-xl border border-[var(--color-border)] bg-white text-slate-700 shadow-sm hover:bg-blue-50"
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {summary
            ? `Business timezone: ${summary.period.timezone}`
            : 'Metrics use persisted business records.'}
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
      {summary && <DashboardContent summary={summary} currency={currency} />}
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
          className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}
function DashboardContent({
  summary,
  currency,
}: {
  summary: DashboardSummary;
  currency: string;
}): ReactElement {
  const kpi = summary.kpis;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <Kpi
          icon={<ShoppingCart />}
          label="Total sales"
          value={quantity(kpi.salesCount)}
          detail={money(kpi.salesValue, currency)}
          href="/app/sales/history"
          tone="blue"
        />
        <Kpi
          icon={<DollarSign />}
          label="Revenue"
          value={money(kpi.revenue, currency)}
          detail="Recognized sales value"
          href="/app/sales/history"
          tone="green"
        />
        <Kpi
          icon={<Wallet />}
          label="Payments due"
          value={money(kpi.paymentsDue, currency)}
          detail="Outstanding balances"
          href="/app/payments"
          tone="amber"
        />
        <Kpi
          icon={<TrendingUp />}
          label="Gross profit"
          value={money(kpi.grossProfit, currency)}
          detail={kpi.grossProfit === null ? 'Cost data unavailable' : 'Revenue less item cost'}
          href="/app/reports"
          tone="violet"
        />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel title="Sales overview" description="Revenue from valid sales by business day">
          <TrendChart items={summary.salesTrend} currency={currency} />
        </Panel>
        <Panel
          title="Stock overview"
          description="Current inventory and products that need attention"
        >
          <StockOverview summary={summary} currency={currency} />
        </Panel>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:max-w-2xl">
        <MiniKpi
          icon={<RotateCcw />}
          label="Returns"
          value={quantity(kpi.returnCount)}
          detail={money(kpi.returnValue, currency)}
          href="/app/returns"
          tone="amber"
        />
        <MiniKpi
          icon={<BarChart3 />}
          label="Net profit"
          value={money(kpi.netProfit, currency)}
          href="/app/accounting"
          tone="green"
        />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Panel title="Top-selling products" description="Best-performing products for this period">
          <TopProducts items={summary.topProducts} />
        </Panel>
        <Panel title="Payment overview" description="Sales grouped by their payment status">
          <Breakdown
            items={summary.paymentOverview.map((item) => ({
              label: statusLabel(item.payment_status),
              value: item.order_count,
              detail: money(item.amount, currency),
            }))}
          />
        </Panel>
        <Panel
          title="Fulfillment overview"
          description="Orders grouped by their current fulfillment stage"
        >
          <Breakdown
            items={summary.fulfillmentOverview.map((item) => ({
              label: statusLabel(item.fulfillment_status),
              value: item.order_count,
            }))}
            empty="No orders in this period."
          />
        </Panel>
      </div>
      <PageSection
        title="Low-stock products"
        description="Review current stock levels and restock thresholds."
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
      className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[0_4px_18px_rgba(30,64,175,0.04)] transition hover:-translate-y-0.5 hover:shadow-md sm:p-5"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <p className="truncate text-xs text-slate-500">{detail}</p>
        <ArrowUpRight
          size={15}
          className="shrink-0 text-slate-300 transition-colors group-hover:text-blue-600"
        />
      </div>
    </Link>
  );
}
function MiniKpi({
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
  detail?: string;
  href: string;
  tone: string;
}): ReactElement {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
  };
  return (
    <Link
      to={href}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white/80 p-3.5 transition hover:bg-white hover:shadow-sm"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="block truncate text-sm font-bold text-slate-800">{value}</span>
        {detail && <span className="block truncate text-[11px] text-slate-500">{detail}</span>}
      </span>
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
    <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[0_4px_18px_rgba(30,64,175,0.04)] sm:p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}
function TrendChart({
  items,
  currency,
}: {
  items: DashboardSummary['salesTrend'];
  currency: string;
}): ReactElement {
  if (!items.length)
    return (
      <EmptyState
        title="No sales in this period"
        description="When valid sales are recorded, the daily trend will appear here."
      />
    );
  const values = items.map((item) => Number(item.revenue));
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? 50 : 8 + (index / (values.length - 1)) * 984,
    y: 172 - (value / max) * 142,
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x},${point.y}`).join(' ');
  const firstDay = new Date(`${items[0].day}T00:00:00`);
  const lastDay = new Date(`${items[items.length - 1].day}T00:00:00`);
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900">
          {money(
            items.reduce((total, item) => total + Number(item.revenue), 0),
            currency,
          )}
        </span>
        <span className="text-xs text-slate-500">revenue in selected period</span>
      </div>
      <div className="overflow-hidden">
        <svg
          viewBox="0 0 1000 200"
          role="img"
          aria-label="Daily sales revenue trend"
          className="h-48 w-full overflow-visible"
        >
          <defs>
            <linearGradient id="sales-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3182f6" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#3182f6" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {[30, 75, 120, 165].map((y) => (
            <line key={y} x1="8" x2="992" y1={y} y2={y} stroke="#e8eef8" strokeDasharray="4 5" />
          ))}
          <path d={`${path} L 992,180 L 8,180 Z`} fill="url(#sales-area-fill)" />
          <path
            d={path}
            fill="none"
            stroke="#2474ed"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
          />
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="6"
              fill="#2474ed"
              stroke="white"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-medium text-slate-500">
        <span>{firstDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        {items.length > 2 && (
          <span>{items[Math.floor(items.length / 2)].day.slice(5).replace('-', '/')}</span>
        )}
        <span>{lastDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}
function StockOverview({
  summary,
  currency,
}: {
  summary: DashboardSummary;
  currency: string;
}): ReactElement {
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-blue-50/70 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Stock value
          </p>
          <p className="mt-1 whitespace-nowrap text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl 2xl:text-3xl">
            {money(summary.kpis.stockValue, currency)}
          </p>
        </div>
        <Link
          to="/app/inventory"
          className="shrink-0 rounded-lg bg-white p-2.5 text-blue-700 shadow-sm transition hover:bg-blue-100"
          aria-label="Open inventory"
        >
          <Package size={20} />
        </Link>
      </div>
      <Link
        to="/app/inventory"
        className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-amber-50/70 p-4 transition hover:bg-amber-50"
      >
        <p className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-500">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          Products below threshold
        </p>
        <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-lg font-bold text-amber-700 shadow-sm">
          {quantity(summary.kpis.lowStockCount)}
        </span>
      </Link>
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
