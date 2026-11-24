import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, LoaderCircle, Save } from 'lucide-react';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ErrorState, LoadingState } from '../../components/common/States';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import type { OrganizationSettingsInput } from './settings-validation';

const defaults: OrganizationSettingsInput = {
  name: '',
  businessEmail: '',
  businessPhone: '',
  businessAddress: '',
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  lowStockThreshold: 0,
  receiptPrefix: 'SAGA',
  receiptHeader: '',
  receiptFooter: '',
  receiptNotes: '',
  notificationPreferences: { lowStock: false, sales: false, deliveries: false, returns: false },
  moderatorReturnsEnabled: false,
};

type SettingsResponse = { data: OrganizationSettingsInput; requestId: string };

function Field({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
  required = false,
  min,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  required?: boolean;
  min?: number;
}) {
  const className =
    'mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100';
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {multiline ? (
        <textarea
          className={className}
          value={value ?? ''}
          rows={3}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={className}
          type={type}
          value={value ?? ''}
          min={min}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function SettingsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<OrganizationSettingsInput | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['organization-settings'],
    queryFn: () => apiFetch<SettingsResponse>('/api/settings'),
  });
  const form = edited ?? query.data?.data.data ?? defaults;
  const save = useMutation({
    mutationFn: () =>
      apiFetch<SettingsResponse>('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify(form),
      }),
    onSuccess: async (result) => {
      setEdited({ ...defaults, ...result.data.data });
      setNotice('Settings saved.');
      await queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      await auth.refresh();
    },
    onError: (error) => setNotice(error.message),
  });

  const change = <K extends keyof OrganizationSettingsInput>(
    key: K,
    value: OrganizationSettingsInput[K],
  ) => setEdited((current) => ({ ...(current ?? form), [key]: value }));

  if (query.isLoading) return <LoadingState label="Loading organization settings" />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administration"
        title="Organization settings"
        description="Manage business identity, receipt defaults, inventory alerts, and operational policy."
        actions={
          <Button
            type="submit"
            form="organization-settings-form"
            disabled={save.isPending || !auth.csrfToken}
            className="gap-2 bg-teal-800 text-white hover:bg-teal-900"
          >
            {save.isPending ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save changes
          </Button>
        }
      />
      <form
        id="organization-settings-form"
        className="space-y-7"
        onSubmit={(event) => {
          event.preventDefault();
          setNotice('');
          save.mutate();
        }}
      >
        <Card className="rounded-lg border-slate-200 shadow-none">
          <section className="p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Building2 size={18} className="text-teal-800" /> Business identity
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Business name"
                value={form.name}
                required
                onChange={(value) => change('name', value)}
              />
              <Field
                label="Business email"
                type="email"
                value={form.businessEmail || ''}
                onChange={(value) => change('businessEmail', value)}
              />
              <Field
                label="Phone"
                value={form.businessPhone || ''}
                onChange={(value) => change('businessPhone', value)}
              />
              <Field
                label="Address"
                value={form.businessAddress || ''}
                onChange={(value) => change('businessAddress', value)}
              />
            </div>
          </section>
        </Card>

        <Card className="rounded-lg border-slate-200 shadow-none">
          <section className="p-5 sm:p-7">
            <h2 className="text-base font-semibold text-slate-900">Currency and timezone</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="ISO currency code"
                value={form.currency}
                required
                onChange={(value) => change('currency', value.toUpperCase())}
              />
              <Field
                label="IANA timezone"
                value={form.timezone}
                required
                onChange={(value) => change('timezone', value)}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Timezone example: Asia/Dhaka. Currency example: BDT.
            </p>
          </section>
        </Card>

        <Card className="rounded-lg border-slate-200 shadow-none">
          <section className="p-5 sm:p-7">
            <h2 className="text-base font-semibold text-slate-900">
              Receipt and inventory defaults
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Receipt prefix"
                value={form.receiptPrefix}
                required
                onChange={(value) => change('receiptPrefix', value)}
              />
              <Field
                label="Default low-stock threshold"
                type="number"
                min={0}
                value={form.lowStockThreshold}
                onChange={(value) => change('lowStockThreshold', Number(value))}
              />
              <Field
                label="Receipt header"
                value={form.receiptHeader || ''}
                multiline
                onChange={(value) => change('receiptHeader', value)}
              />
              <Field
                label="Receipt footer"
                value={form.receiptFooter || ''}
                multiline
                onChange={(value) => change('receiptFooter', value)}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Receipt notes"
                  value={form.receiptNotes || ''}
                  multiline
                  onChange={(value) => change('receiptNotes', value)}
                />
              </div>
            </div>
          </section>
        </Card>

        <Card className="rounded-lg border-slate-200 shadow-none">
          <section className="p-5 sm:p-7">
            <h2 className="text-base font-semibold text-slate-900">Notifications and policy</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Object.entries(form.notificationPreferences).map(([key, enabled]) => (
                <label key={key} className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) =>
                      change('notificationPreferences', {
                        ...form.notificationPreferences,
                        [key]: event.target.checked,
                      })
                    }
                    className="size-4 accent-teal-800"
                  />
                  {key === 'lowStock'
                    ? 'Low-stock alerts'
                    : `${key[0].toUpperCase()}${key.slice(1)} notifications`}
                </label>
              ))}
            </div>
            <label className="mt-5 flex items-start gap-3 border-t border-slate-200 pt-5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.moderatorReturnsEnabled}
                onChange={(event) => change('moderatorReturnsEnabled', event.target.checked)}
                className="mt-0.5 size-4 accent-teal-800"
              />
              <span>
                <span className="block font-medium">Allow Moderator returns and refunds</span>
                <span className="mt-1 block text-xs text-slate-500">
                  This policy is enforced by the return transaction API and database.
                </span>
              </span>
            </label>
          </section>
        </Card>
        <div className="flex min-h-8 items-center justify-between gap-4">
          <p aria-live="polite" role="status" className="text-sm text-slate-600">
            {notice &&
              (save.isSuccess ? (
                <Check size={16} className="mr-1 inline text-emerald-700" />
              ) : null)}
            {notice}
          </p>
          <span className="text-xs text-slate-400">
            Provider credentials are managed in server environment settings.
          </span>
        </div>
      </form>
    </PageContainer>
  );
}
