import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api/client';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';

type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  event_category: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_reference: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
  request_id: string | null;
};
type AuditResponse = {
  data: AuditEntry[];
  pagination: { page: number; pageSize: number; total: number };
  timezone: string;
  requestId: string;
};
type MembersResponse = {
  data: Array<{ userId: string; fullName: string; role: string; email: string }>;
};

const categories = [
  ['auth', 'Authentication'],
  ['role_change', 'Role and membership'],
  ['product_stock', 'Products and stock'],
  ['sale', 'Sales'],
  ['payment', 'Payments'],
  ['delivery', 'Delivery'],
  ['return', 'Returns'],
  ['settings', 'Settings'],
  ['communication', 'Communications'],
];

function displayTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const incompleteDateRange = Boolean(from) !== Boolean(to);
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (actorId) params.set('actorId', actorId);
  if (from && to) {
    params.set('from', from);
    params.set('to', to);
  }
  const query = useQuery({
    queryKey: ['admin-audit-logs', page, search, category, actorId, from, to],
    queryFn: () => apiFetch<AuditResponse>(`/api/admin/audit-logs?${params}`),
    enabled: !incompleteDateRange,
  });
  const actorsQuery = useQuery({
    queryKey: ['admin-audit-actors'],
    queryFn: () => apiFetch<MembersResponse>('/api/admin/users?page=1&pageSize=100'),
  });

  if (query.isLoading || actorsQuery.isLoading)
    return <LoadingState label="Loading audit history" />;
  if (query.isError || actorsQuery.isError)
    return (
      <ErrorState
        onRetry={() => {
          void query.refetch();
          void actorsQuery.refetch();
        }}
      />
    );
  const rows = query.data?.data.data || [];
  const pagination = query.data?.data.pagination;
  const timezone = query.data?.data.timezone || 'UTC';
  const actors = actorsQuery.data?.data.data || [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Immutable organization activity across authentication, operations, settings, and communications."
      />
      <Card className="rounded-lg border-slate-200 p-4 shadow-none sm:p-5">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 lg:col-span-2">
            Search
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Actor, action, entity or reference"
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Category
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800"
            >
              <option value="">All categories</option>
              {categories.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 lg:col-span-2">
            Actor
            <select
              value={actorId}
              onChange={(event) => {
                setActorId(event.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800"
            >
              <option value="">All actors</option>
              {actors.map((actor) => (
                <option key={actor.userId} value={actor.userId}>
                  {actor.fullName} · {actor.role}
                  {actor.email ? ` · ${actor.email}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal tracking-normal text-slate-800"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Through
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal tracking-normal text-slate-800"
            />
          </label>
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button className="bg-teal-800 text-white hover:bg-teal-900">Search logs</Button>
            <span className="pb-2 text-xs text-slate-500">Times shown in {timezone}</span>
          </div>
        </form>
      </Card>

      {incompleteDateRange ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          Choose both date boundaries to filter by business date.
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No matching events"
            description="Audit results will appear here when persisted activity matches these filters."
          />
        </div>
      ) : (
        <Card className="mt-5 overflow-hidden rounded-lg border-slate-200 shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {displayTime(entry.created_at, timezone)}
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-medium text-slate-900">
                        {entry.actor_name || 'System'}
                      </span>
                      <span className="ml-2 text-xs capitalize text-slate-500">
                        {entry.actor_role || ''}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {entry.event_category?.replaceAll('_', ' ') || 'Other'}
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-800">
                      {entry.action.replaceAll('_', ' ')}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {entry.entity_type}
                      {entry.entity_reference
                        ? ` · ${entry.entity_reference}`
                        : entry.entity_id
                          ? ` · ${entry.entity_id.slice(0, 8)}`
                          : ''}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Button
                        onClick={() => setSelected(entry)}
                        className="border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
            <span>{pagination?.total || 0} events</span>
            <div className="flex items-center gap-2">
              <Button
                className="border border-slate-300 bg-white px-3 py-1.5"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                className="border border-slate-300 bg-white px-3 py-1.5"
                disabled={!pagination || page * pagination.pageSize >= pagination.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </footer>
        </Card>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-detail-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl sm:p-7"
          >
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-teal-800">
                  {selected.event_category || 'uncategorized'}
                </p>
                <h2 id="audit-detail-title" className="mt-1 text-xl font-semibold text-slate-950">
                  {selected.action.replaceAll('_', ' ')}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {selected.actor_name || 'System'} · {displayTime(selected.created_at, timezone)} ·{' '}
                  {selected.entity_type} {selected.entity_id || ''}
                </p>
              </div>
              <Button
                onClick={() => setSelected(null)}
                className="border border-slate-300 bg-white"
              >
                Close
              </Button>
            </header>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Before</h3>
                <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-emerald-100">
                  {JSON.stringify(selected.before_data ?? null, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">After</h3>
                <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-emerald-100">
                  {JSON.stringify(selected.after_data ?? null, null, 2)}
                </pre>
              </div>
            </div>
            {selected.request_id && (
              <p className="mt-4 text-xs text-slate-500">Request ID: {selected.request_id}</p>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
