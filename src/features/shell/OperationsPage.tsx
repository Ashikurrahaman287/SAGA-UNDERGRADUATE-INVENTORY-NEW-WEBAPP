import { useMemo, useState, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

export type OperationsSection = 'payments' | 'costs' | 'accounting' | 'reports' | 'crm' | 'investments';

const titles: Record<OperationsSection, { eyebrow: string; title: string; description: string }> = {
  payments: { eyebrow: 'Finance', title: 'Payments', description: 'Review collected, pending, and recorded sale payments.' },
  costs: { eyebrow: 'Finance', title: 'Operational Costs', description: 'Record and review business operating expenses.' },
  accounting: { eyebrow: 'Accounting', title: 'Accounting Summary', description: 'Revenue, collections, expenses, refunds, and outstanding balances.' },
  reports: { eyebrow: 'Business intelligence', title: 'Reports', description: 'Sales, customer, and inventory performance snapshots.' },
  crm: { eyebrow: 'Relationships', title: 'CRM & Loyalty', description: 'Customer purchase activity and relationship value.' },
  investments: { eyebrow: 'Assets', title: 'Investments', description: 'Current inventory value by cost and retail valuation.' },
};

function money(value: unknown, currency: string): string {
  const number = Number(value || 0);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(number);
}

export function OperationsPage({ section }: { section: OperationsSection }): ReactElement {
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const meta = titles[section];
  const queryClient = useQueryClient();
  const [costName, setCostName] = useState('');
  const [costCategory, setCostCategory] = useState('Miscellaneous');
  const [costAmount, setCostAmount] = useState('');
  const [costDate, setCostDate] = useState(new Date().toISOString().slice(0, 10));
  const [costDescription, setCostDescription] = useState('');

  const query = useQuery({
    queryKey: ['operations', section],
    queryFn: () => apiFetch<{ data: unknown; requestId: string }>(`/api/operations?section=${section}`),
  });

  const createCost = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/operations?section=costs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify({
          name: costName,
          category: costCategory,
          amount: Number(costAmount),
          date: costDate,
          description: costDescription,
        }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || 'The operating cost could not be added.');
      return body;
    },
    onSuccess: () => {
      setCostName('');
      setCostAmount('');
      setCostDescription('');
      void queryClient.invalidateQueries({ queryKey: ['operations', 'costs'] });
    },
  });

  const content = useMemo(() => {
    if (!query.data) return null;
    const data = query.data.data.data as any;
    if (section === 'accounting') return <Accounting data={data} currency={currency} />;
    if (section === 'payments') return <Payments data={data} currency={currency} />;
    if (section === 'costs') return <Costs data={data} currency={currency} />;
    if (section === 'reports') return <Reports data={data} currency={currency} />;
    if (section === 'crm') return <CRM data={data} currency={currency} />;
    return <Investments data={data} currency={currency} />;
  }, [query.data, section, currency]);

  return (
    <PageContainer>
      <PageHeader eyebrow={meta.eyebrow} title={meta.title} description={meta.description} />
      {section === 'costs' && (
        <form
          className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5"
          onSubmit={(event) => { event.preventDefault(); void createCost.mutateAsync(); }}
        >
          <TextField label="Cost name" value={costName} onChange={setCostName} placeholder="Transport, utilities..." />
          <TextField label="Category" value={costCategory} onChange={setCostCategory} />
          <TextField label="Amount" value={costAmount} onChange={setCostAmount} type="number" />
          <TextField label="Date" value={costDate} onChange={setCostDate} type="date" />
          <TextField label="Description" value={costDescription} onChange={setCostDescription} placeholder="Optional" />
          <div className="md:col-span-5 flex justify-end">
            <Button disabled={createCost.isPending || !costName || !costAmount} className="bg-blue-600 text-white">
              {createCost.isPending ? 'Adding...' : 'Add operating cost'}
            </Button>
          </div>
          {createCost.isError && <p className="md:col-span-5 text-sm text-rose-700">{createCost.error.message}</p>}
        </form>
      )}
      {query.isPending ? <LoadingState label={`Loading ${meta.title.toLowerCase()}`} /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : content}
    </PageContainer>
  );
}

function TextField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>;
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-950">{value}</p></div>;
}

function Accounting({ data, currency }: { data: any; currency: string }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Revenue" value={money(data.revenue,currency)} /><Metric label="Collected" value={money(data.collected,currency)} /><Metric label="Expenses" value={money(data.expenses,currency)} /><Metric label="Refunded" value={money(data.refunded,currency)} /><Metric label="Outstanding" value={money(data.outstanding,currency)} /><Metric label="Net cash" value={money(data.net,currency)} /></div>;
}

function Payments({ data, currency }: { data: any[]; currency: string }) {
  if (!data.length) return <EmptyState title="No payments" description="Payments recorded with sales will appear here." />;
  return <Table headers={['Receipt','Customer','Method','Reference','Amount','Status','Collected']} rows={data.map((row) => [row.sales?.receipt_number || '—',row.sales?.customers?.name || '—',row.payment_method,row.payment_reference || '—',money(row.amount,currency),row.status,row.collected_at ? new Date(row.collected_at).toLocaleString() : '—'])} />;
}

function Costs({ data, currency }: { data: { categories: any[]; costs: any[] }; currency: string }) {
  if (!data.costs.length) return <EmptyState title="No operational costs" description="Add the first operating expense above." />;
  return <Table headers={['Date','Category','Description','Amount']} rows={data.costs.map((row) => [row.expense_date,row.expense_categories?.name || '—',row.description,row.amount != null ? money(row.amount,currency) : '—'])} />;
}

function Reports({ data, currency }: { data: any; currency: string }) {
  const salesValue=(data.sales||[]).reduce((t:number,r:any)=>t+Number(r.total_amount||0),0);
  return <><div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Sales" value={String(data.sales?.length||0)} /><Metric label="Sales value" value={money(salesValue,currency)} /><Metric label="Customers" value={String(data.customerCount||0)} /><Metric label="Inventory retail value" value={money(data.inventoryRetail,currency)} /></div><Table headers={['Product','SKU','Stock','Cost value','Retail value']} rows={(data.products||[]).map((row:any)=>[row.name,row.sku,row.quantity,money(Number(row.quantity||0)*Number(row.cost_price||0),currency),money(Number(row.quantity||0)*Number(row.selling_price||0),currency)])} /></>;
}

function CRM({ data, currency }: { data: any[]; currency: string }) {
  if (!data.length) return <EmptyState title="No customers" description="Customer relationships will appear after records are added." />;
  return <Table headers={['Customer','Phone','Email','Orders','Purchase value','Status']} rows={data.map((row)=>[row.name,row.phone||'—',row.email||'—',row.orders||0,money(row.value||0,currency),row.is_active?'Active':'Inactive'])} />;
}

function Investments({ data, currency }: { data: any[]; currency: string }) {
  const cost=data.reduce((t,r)=>t+Number(r.costValue||0),0);
  const retail=data.reduce((t,r)=>t+Number(r.retailValue||0),0);
  return <><div className="mb-5 grid gap-4 sm:grid-cols-2"><Metric label="Inventory at cost" value={money(cost,currency)} /><Metric label="Inventory at retail" value={money(retail,currency)} /></div><Table headers={['Asset / Product','SKU','Units','Cost value','Retail value']} rows={data.map((row)=>[row.name,row.sku,row.units,money(row.costValue,currency),money(row.retailValue,currency)])} /></>;
}

function Table({ headers, rows }: { headers: string[]; rows: unknown[][] }): ReactElement {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{headers.map((header)=><th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody>{rows.map((row,rowIndex)=><tr key={rowIndex} className="border-t border-slate-100">{row.map((cell,cellIndex)=><td key={cellIndex} className="px-4 py-3 text-slate-700">{String(cell)}</td>)}</tr>)}</tbody></table></div>;
}
