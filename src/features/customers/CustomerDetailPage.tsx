import { Edit3, MessageSquare, Plus, Save, ShieldCheck } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader, PageSection } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import { hasPermission } from '../../lib/permissions/permission-utils';
import { permissions } from '../../lib/permissions/permission-registry';
import { useParams } from 'react-router-dom';
import type { Consent, Customer, CustomerAddress, CustomerNote } from './customer-types';
import { CustomerForm } from './CustomerForm';

function money(value: number | string, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
}
export function CustomerDetailPage(): ReactElement {
  const { id } = useParams();
  const auth = useAuth();
  const currency = auth.session?.organization.currency || 'USD';
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [addressOpen, setAddressOpen] = useState(false);
  const query = useQuery({
    queryKey: ['customer', id],
    queryFn: () =>
      apiFetch<{
        data: Customer & {
          addresses: CustomerAddress[];
          notes: CustomerNote[];
          consents: Consent[];
        };
        requestId: string;
      }>(`/api/customers/${id}`),
    enabled: Boolean(id),
  });
  const summary = useQuery({
    queryKey: ['customer-summary', id],
    queryFn: () =>
      apiFetch<{
        data: {
          totalOrders: number;
          totalPurchase: number | string;
          averageOrderValue: number | string;
          lastPurchase: string | null;
        };
        requestId: string;
      }>(`/api/customers/${id}/summary`),
    enabled: Boolean(id),
  });
  const history = useQuery({
    queryKey: ['customer-history', id],
    queryFn: () =>
      apiFetch<{
        data: Array<{
          id: string;
          receipt_number: string;
          total_amount: number | string;
          payment_status: string;
          fulfillment_status: string;
          created_at: string;
        }>;
        requestId: string;
      }>(`/api/customers/${id}/purchase-history`),
    enabled: Boolean(id),
  });
  if (query.isPending)
    return (
      <PageContainer>
        <LoadingState label="Loading customer" />
      </PageContainer>
    );
  if (query.isError || !query.data?.data.data)
    return (
      <PageContainer>
        <ErrorState onRetry={() => void query.refetch()} />
      </PageContainer>
    );
  const customer = query.data.data.data;
  const canEdit = hasPermission(auth.session?.role, permissions.customersUpdate);
  async function save(
    values: Parameters<NonNullable<React.ComponentProps<typeof CustomerForm>['onSubmit']>>[0],
  ): Promise<void> {
    const response = await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({
        name: values.name,
        phone: values.phone,
        email: values.email,
        notes: values.notes,
      }),
    });
    if (response.ok) {
      setEditing(false);
      await query.refetch();
    }
  }
  async function addNote(): Promise<void> {
    if (!note.trim()) return;
    const response = await fetch(`/api/customers/${customer.id}/notes`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ note }),
    });
    if (response.ok) {
      setNote('');
      await query.refetch();
    }
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Customer profile"
        title={customer.name}
        description={`${customer.phone}${customer.email ? ` · ${customer.email}` : ''}`}
        actions={
          canEdit ? (
            <Button
              onClick={() => setEditing((value) => !value)}
              className="border border-slate-300 bg-white text-slate-700"
            >
              <Edit3 size={16} className="mr-2" /> Edit profile
            </Button>
          ) : undefined
        }
      />
      {editing && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <CustomerForm
            initial={{
              name: customer.name,
              phone: customer.phone,
              email: customer.email || '',
              notes: customer.notes || '',
            }}
            onSubmit={save}
            onCancel={() => setEditing(false)}
            submitting={false}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Total orders" value={String(summary.data?.data.data.totalOrders ?? 0)} />
        <Info
          label="Total purchase"
          value={money(summary.data?.data.data.totalPurchase || 0, currency)}
        />
        <Info
          label="Average order"
          value={money(summary.data?.data.data.averageOrderValue || 0, currency)}
        />
        <Info label="Customer since" value={new Date(customer.created_at).toLocaleDateString()} />
      </div>
      <PageSection
        title="Delivery addresses"
        description="Current addresses do not rewrite historical sale snapshots."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {customer.addresses?.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              csrfToken={auth.csrfToken}
              customerId={customer.id}
              onUpdated={() => void query.refetch()}
            />
          ))}
          {canEdit && (
            <button
              onClick={() => setAddressOpen(true)}
              className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              <Plus size={17} className="mr-2" /> Add address
            </button>
          )}
        </div>
        {addressOpen && (
          <AddressForm
            customerId={customer.id}
            csrfToken={auth.csrfToken}
            onClose={() => setAddressOpen(false)}
            onSaved={() => {
              setAddressOpen(false);
              void query.refetch();
            }}
          />
        )}
      </PageSection>
      <PageSection
        title="Purchase history"
        description="Valid sales only; cancelled sales are excluded."
      >
        {history.data?.data.data.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Receipt</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Payment</th>
                  <th className="px-5 py-3">Fulfillment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.data.data.data.map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-5 py-3 font-semibold text-blue-700">{sale.receipt_number}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {new Date(sale.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {money(sale.total_amount, currency)}
                    </td>
                    <td className="px-5 py-3 capitalize text-slate-600">{sale.payment_status}</td>
                    <td className="px-5 py-3 capitalize text-slate-600">
                      {sale.fulfillment_status.replaceAll('_', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No purchase history"
            description="Valid sales associated with this customer will appear here."
          />
        )}
      </PageSection>
      <PageSection
        title="Internal notes"
        description="Notes are visible to Admin and Moderator users only."
      >
        <div className="space-y-3">
          {customer.notes?.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm leading-6 text-slate-700">{item.note}</p>
              <p className="mt-2 text-xs text-slate-400">
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add an internal note"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <Button onClick={() => void addNote()} className="bg-blue-600 text-white">
              <MessageSquare size={16} className="mr-2" /> Add note
            </Button>
          </div>
        </div>
      </PageSection>
      <PageSection
        title="Communication consent"
        description="Unknown is not treated as consent. Messaging is not sent from this module."
      >
        <ConsentList
          consents={customer.consents || []}
          customerId={customer.id}
          csrfToken={auth.csrfToken}
          canManage={auth.session?.role === 'admin'}
          onUpdated={() => void query.refetch()}
        />
      </PageSection>
    </PageContainer>
  );
}
function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
function AddressCard({
  address,
  csrfToken,
  customerId,
  onUpdated,
}: {
  address: CustomerAddress;
  csrfToken: string;
  customerId: string;
  onUpdated: () => void;
}): ReactElement {
  async function makeDefault(): Promise<void> {
    await fetch(`/api/customers/${customerId}/addresses/${address.id}/default`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken },
    });
    onUpdated();
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{address.address_label || 'Address'}</h3>
        {address.is_default && (
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
            Default
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {address.address_line}
        <br />
        {address.area && `${address.area}, `}
        {address.city}
        {address.postal_code ? ` ${address.postal_code}` : ''}
      </p>
      {!address.is_default && (
        <Button
          onClick={() => void makeDefault()}
          className="mt-4 border border-slate-300 bg-white text-sm text-slate-700"
        >
          Set default
        </Button>
      )}
    </div>
  );
}
function AddressForm({
  customerId,
  csrfToken,
  onClose,
  onSaved,
}: {
  customerId: string;
  csrfToken: string;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  async function save(): Promise<void> {
    const response = await fetch(`/api/customers/${customerId}/addresses`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ addressLine, city, area, isDefault: false }),
    });
    if (response.ok) onSaved();
  }
  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={addressLine}
          onChange={(event) => setAddressLine(event.target.value)}
          placeholder="Address line"
          className="rounded-lg border border-blue-200 px-3 py-2.5 text-sm"
        />
        <input
          value={area}
          onChange={(event) => setArea(event.target.value)}
          placeholder="Area"
          className="rounded-lg border border-blue-200 px-3 py-2.5 text-sm"
        />
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="City"
          className="rounded-lg border border-blue-200 px-3 py-2.5 text-sm"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onClose} className="border border-slate-300 bg-white text-slate-700">
          Cancel
        </Button>
        <Button onClick={() => void save()} className="bg-blue-600 text-white">
          <Save size={16} className="mr-2" /> Save address
        </Button>
      </div>
    </div>
  );
}
function ConsentList({
  consents,
  customerId,
  csrfToken,
  canManage,
  onUpdated,
}: {
  consents: Consent[];
  customerId: string;
  csrfToken: string;
  canManage: boolean;
  onUpdated: () => void;
}): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {['sms', 'email'].map((channel) => {
        const consent = consents.find((item) => item.channel === channel);
        return (
          <div
            key={channel}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-blue-600" />
              <span className="text-sm font-semibold capitalize text-slate-700">{channel}</span>
            </div>
            {canManage ? (
              <select
                value={consent?.consent_status || 'unknown'}
                onChange={async (event) => {
                  await fetch(`/api/customers/${customerId}/consent`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify({
                      channel,
                      consentStatus: event.target.value,
                      source: 'customer_profile',
                    }),
                  });
                  onUpdated();
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value="unknown">Unknown</option>
                <option value="granted">Granted</option>
                <option value="denied">Denied</option>
              </select>
            ) : (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${consent?.consent_status === 'granted' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
              >
                {consent?.consent_status || 'unknown'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
