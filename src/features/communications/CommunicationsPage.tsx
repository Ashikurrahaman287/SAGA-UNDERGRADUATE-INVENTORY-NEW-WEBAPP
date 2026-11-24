import { Mail, RefreshCw, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';

type Template = {
  id: string;
  template_type: 'receipt' | 'delivery_reminder' | 'cancellation' | 'campaign';
  channel: 'sms' | 'email';
  label: 'transactional' | 'promotional';
  name: string;
  subject?: string | null;
  content: string;
  is_active: boolean;
};
type Log = {
  id: string;
  channel: 'sms' | 'email';
  label: string;
  template_type: string;
  recipient: string;
  provider_reference?: string | null;
  delivery_status: string;
  provider_error_code?: string | null;
  provider_message_id?: string | null;
  created_at: string;
};

function segmentCount(message: string): { encoding: 'GSM-7' | 'UCS-2'; segments: number } {
  const ascii = Array.from(message).every((character) => character.charCodeAt(0) <= 127);
  if (ascii)
    return {
      encoding: 'GSM-7',
      segments: !message ? 0 : message.length <= 160 ? 1 : Math.ceil(message.length / 153),
    };
  return {
    encoding: 'UCS-2',
    segments: !message ? 0 : message.length <= 70 ? 1 : Math.ceil(message.length / 67),
  };
}

export function CommunicationsPage(): ReactElement {
  const auth = useAuth();
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [label, setLabel] = useState<'transactional' | 'promotional'>('transactional');
  const [templateType, setTemplateType] = useState<
    'receipt' | 'delivery_reminder' | 'cancellation' | 'campaign'
  >('receipt');
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const balance = useQuery({
    queryKey: ['sms-balance'],
    queryFn: () =>
      apiFetch<{ data: { available: number; used: number }; requestId: string }>(
        '/api/communications/sms/balance',
      ),
    retry: false,
  });
  const templates = useQuery({
    queryKey: ['communication-templates'],
    queryFn: () =>
      apiFetch<{ data: Template[]; requestId: string }>('/api/communications/templates'),
  });
  const logs = useQuery({
    queryKey: ['communication-logs'],
    queryFn: () =>
      apiFetch<{ data: Log[]; total: number; requestId: string }>(
        '/api/communications/logs?page=1&pageSize=25',
      ),
  });
  const selectedTemplate = templates.data?.data.data.find(
    (template) => template.channel === channel && template.template_type === templateType,
  );
  const segments = segmentCount(message);
  async function dispatch(): Promise<void> {
    setSending(true);
    setError('');
    setSentMessage('');
    const recipientList = recipients
      .split(/[,+\n]/)
      .map((recipient) => recipient.trim())
      .filter(Boolean)
      .map((recipient) => ({ phone: recipient }));
    const response = await fetch('/api/communications/send', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({
        channel,
        label: channel === 'sms' ? label : 'transactional',
        templateType,
        recipients: recipientList,
        message,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Communication could not be sent.');
    } else {
      const body = (await response.json()) as { data: { status: string; recipients: string[] } };
      setSentMessage(
        `${body.data.status === 'sent' ? 'Provider accepted' : 'Provider reported a failure'} for ${body.data.recipients.length} recipient(s).`,
      );
      await logs.refetch();
    }
    setSending(false);
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Admin communications"
        title="Communications"
        description="SwiftSMS balance, templates, consent-safe dispatch, and immutable send logs"
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone size={18} className="text-blue-600" />
              <h2 className="font-semibold text-slate-900">SwiftSMS balance</h2>
            </div>
            <Button
              onClick={() => void balance.refetch()}
              className="border border-slate-300 bg-white text-slate-700"
            >
              <RefreshCw size={16} />
            </Button>
          </div>
          {balance.isPending ? (
            <LoadingState label="Checking balance" />
          ) : balance.isError ? (
            <ErrorState onRetry={() => void balance.refetch()} />
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <BalanceCard
                label="Available credits"
                value={String(balance.data?.data.data.available ?? '—')}
              />
              <BalanceCard
                label="Used credits"
                value={String(balance.data?.data.data.used ?? '—')}
              />
            </div>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">Dispatch</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Select
              label="Channel"
              value={channel}
              onChange={(value) => setChannel(value as 'sms' | 'email')}
              options={[
                ['sms', 'SMS'],
                ['email', 'Email'],
              ]}
            />
            <Select
              label="Template"
              value={templateType}
              onChange={(value) => setTemplateType(value as typeof templateType)}
              options={[
                ['receipt', 'Receipt'],
                ['delivery_reminder', 'Delivery reminder'],
                ['cancellation', 'Cancellation'],
                ['campaign', 'Campaign'],
              ]}
            />
            <Select
              label="Label"
              value={label}
              onChange={(value) => setLabel(value as 'transactional' | 'promotional')}
              options={[
                ['transactional', 'Transactional'],
                ['promotional', 'Promotional'],
              ]}
            />
          </div>
          {selectedTemplate && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">{selectedTemplate.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-blue-700">{selectedTemplate.content}</p>
            </div>
          )}
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Recipients</span>
            <textarea
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              rows={3}
              placeholder="01700000000+01800000000 or one number per line"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <span className="mt-2 block text-xs text-slate-500">
              {segments.encoding} · {segments.segments} segment(s) · {message.length} characters
            </span>
          </label>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}{' '}
          {sentMessage && (
            <p
              role="status"
              className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              {sentMessage}
            </p>
          )}
          <Button
            disabled={sending || !message.trim() || (channel === 'sms' && !recipients.trim())}
            onClick={() => void dispatch()}
            className="mt-4 w-full bg-blue-600 text-white"
          >
            {sending ? (
              'Sending...'
            ) : (
              <>
                <Send size={16} className="mr-2" /> Dispatch
              </>
            )}
          </Button>
          {channel === 'email' && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-700">
              <ShieldCheck size={14} /> Email dispatch is not live until a server email provider is
              configured.
            </p>
          )}
        </section>
      </div>
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">Send logs</h2>
        {logs.isPending ? (
          <LoadingState label="Loading send logs" />
        ) : logs.isError ? (
          <ErrorState onRetry={() => void logs.refetch()} />
        ) : logs.data?.data.data.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.data.data.data.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 uppercase text-slate-700">{log.channel}</td>
                    <td className="px-4 py-3 text-slate-600">{log.recipient}</td>
                    <td className="px-4 py-3 text-slate-600">{log.template_type}</td>
                    <td className="px-4 py-3">
                      <Status status={log.delivery_status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{log.provider_error_code || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No send logs"
            description="Dispatch attempts will appear here with provider results."
          />
        )}
      </section>
    </PageContainer>
  );
}
function BalanceCard({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}): ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
function Status({ status }: { status: string }): ReactElement {
  const tone =
    status === 'sent' || status === 'delivered'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'rejected_consent'
        ? 'bg-amber-100 text-amber-800'
        : status === 'failed'
          ? 'bg-rose-100 text-rose-800'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
