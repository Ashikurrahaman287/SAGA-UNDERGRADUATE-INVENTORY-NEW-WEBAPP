import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../src/features/auth/auth-store';
import { DeliveryPage } from '../../src/features/fulfillment/DeliveryPage';
import { formatDateTimeInput, localDateTimeToUtcIso } from '../../src/features/fulfillment/delivery-date';

type TestRow = {
  id: string;
  sale_id: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  delivered_at?: string | null;
  sales: {
    receipt_number: string;
    total_amount: string;
    confirmed_paid_amount: string;
    amount_paid: string;
    amount_due: string;
    delivery_address_snapshot: { addressLine: string; city: string };
    delivery_scheduled_at: string | null;
    created_at: string;
    customers: { name: string; phone: string; email: string };
    sale_items: Array<{ product_name_snapshot: string; sku_snapshot: string; quantity: number }>;
  };
};

const timezone = 'Asia/Dhaka';
function shiftDate(dateText: string, days: number): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}
function makeRow(receipt: string, dateText: string, scheduleTime = '12:00'): TestRow {
  const scheduledAt = localDateTimeToUtcIso(dateText, scheduleTime, timezone);
  return {
    id: receipt,
    sale_id: receipt,
    status: 'assigned',
    scheduled_at: scheduledAt,
    created_at: scheduledAt,
    sales: {
      receipt_number: receipt,
      total_amount: '100.00',
      confirmed_paid_amount: '50.00',
      amount_paid: '50.00',
      amount_due: '50.00',
      delivery_address_snapshot: { addressLine: '12 Main Road', city: 'Dhaka' },
      delivery_scheduled_at: scheduledAt,
      created_at: scheduledAt,
      customers: { name: 'Sam Customer', phone: '01712345678', email: 'sam@example.test' },
      sale_items: [{ product_name_snapshot: 'Test Book', sku_snapshot: 'BK-42', quantity: 2 }],
    },
  };
}

function setupDeliveryPage() {
  const today = formatDateTimeInput(new Date().toISOString(), timezone).date;
  let rows: TestRow[] = [
    makeRow('RCP-TODAY', today),
    makeRow('RCP-TOMORROW', shiftDate(today, 1)),
    makeRow('RCP-UPCOMING', shiftDate(today, 4)),
  ];
  let completed: TestRow[] = [
    { ...makeRow('RCP-DONE', shiftDate(today, -1)), status: 'delivered', delivered_at: new Date().toISOString() },
  ];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === '/api/deliveries') {
      return new Response(JSON.stringify({ data: rows, completed, timezone, requestId: 'delivery-test' }), { status: 200 });
    }
    if (url.endsWith('/confirm')) {
      rows = rows.filter((row) => row.sale_id !== url.split('/')[3]);
      const delivered = makeRow('RCP-TODAY', today);
      completed = [{ ...delivered, status: 'delivered', delivered_at: new Date().toISOString(), sales: { ...delivered.sales, amount_due: '25.00', confirmed_paid_amount: '75.00', amount_paid: '75.00' } }, ...completed];
      return new Response(JSON.stringify({ data: { amount_due: '25.00', deliveryEmail: 'sent' }, requestId: 'delivery-done' }), { status: 200 });
    }
    if (url.endsWith('/actions')) {
      const body = JSON.parse(String(init?.body || '{}')) as { action?: string; scheduledAt?: string };
      if (body.action === 'reschedule' && body.scheduledAt) {
        rows = rows.map((row) => row.sale_id === url.split('/')[3]
          ? { ...row, scheduled_at: body.scheduledAt || null, sales: { ...row.sales, delivery_scheduled_at: body.scheduledAt || null } }
          : row);
      }
      return new Response(JSON.stringify({ data: { sent: body.action === 'reminder' }, requestId: 'delivery-action' }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: 'Unexpected request' } }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const authValue: AuthContextValue = {
    status: 'authenticated',
    session: {
      authenticated: true,
      user: { id: 'admin-id', name: 'Admin' },
      organization: { id: 'org-id', name: 'SAGA', currency: 'BDT', timezone },
      role: 'admin',
    },
    csrfToken: 'csrf-token',
    refresh: async () => undefined,
    logout: async () => undefined,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<AuthContext.Provider value={authValue}><QueryClientProvider client={queryClient}><DeliveryPage /></QueryClientProvider></AuthContext.Provider>);
  return { requests, fetchMock };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Admin Delivery workflow', () => {
  it('groups active orders by business date and shows item, money, and completed details', async () => {
    setupDeliveryPage();
    expect(await screen.findByText('RCP-TODAY')).toBeInTheDocument();
    expect(screen.getAllByText('Test Book')).toHaveLength(2);
    expect(screen.getAllByText(/BK-42/)).toHaveLength(2);
    expect(screen.getAllByText('Qty 2')).toHaveLength(2);
    const todayCard = screen.getByText('RCP-TODAY').closest('article');
    expect(todayCard).not.toBeNull();
    expect(within(todayCard as HTMLElement).getByText('12 Main Road, Dhaka')).toBeInTheDocument();
    expect(within(todayCard as HTMLElement).getByText(/100\.00/)).toBeInTheDocument();
    expect(within(todayCard as HTMLElement).getAllByText(/50\.00/)).toHaveLength(2);
    expect(screen.getByText('RCP-DONE')).toBeInTheDocument();
    expect(screen.getByText('Delivery Done')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Tomorrow/ }));
    expect(screen.getByText('RCP-TOMORROW')).toBeInTheDocument();
    expect(screen.queryByText('RCP-TODAY')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Upcoming/ }));
    expect(screen.getByText('RCP-UPCOMING')).toBeInTheDocument();
  });

  it('validates partial payment acknowledgement and moves delivered order to Delivery Done', async () => {
    const { requests } = setupDeliveryPage();
    await screen.findByText('RCP-TODAY');
    await userEvent.click(screen.getAllByRole('button', { name: /Delivery Done/ })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Confirm Delivery Done' });
    const amount = within(dialog).getByLabelText('Payment received');
    fireEvent.change(amount, { target: { value: '25' } });
    expect(amount).toHaveValue(25);
    expect(within(dialog).getByText(/will remain due/)).toBeInTheDocument();
    const markDelivered = within(dialog).getByRole('button', { name: 'Mark Delivered' });
    expect(markDelivered).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(markDelivered).toBeEnabled();
    await userEvent.click(markDelivered);

    await waitFor(() => expect(screen.getByText(/Delivered with .*25\.00 still due/)).toBeInTheDocument());
    const confirmRequest = requests.find((request) => request.url.endsWith('/confirm'));
    expect(confirmRequest).toBeDefined();
    expect(JSON.parse(String(confirmRequest?.init?.body))).toMatchObject({ paymentAmount: 25, deliverWithDue: true });
    await waitFor(() => expect(screen.getByText('RCP-DONE')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reschedules through the modal and keeps the selected tab while updating the date group', async () => {
    const { requests } = setupDeliveryPage();
    await screen.findByText('RCP-TODAY');
    await userEvent.click(screen.getAllByRole('button', { name: 'Reschedule' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Reschedule delivery' });
    const today = formatDateTimeInput(new Date().toISOString(), timezone).date;
    const tomorrow = shiftDate(today, 1);
    const dateInput = within(dialog).getByLabelText('Delivery date');
    const timeInput = within(dialog).getByLabelText('Delivery time (optional)');
    fireEvent.change(dateInput, { target: { value: tomorrow } });
    fireEvent.change(timeInput, { target: { value: '23:59' } });
    expect(dateInput).toHaveValue(tomorrow);
    expect(timeInput).toHaveValue('23:59');
    await userEvent.type(within(dialog).getByLabelText('Reason or note (optional)'), 'Customer requested a new date');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save new date' }));
    await waitFor(() => {
      const alert = screen.queryByRole('alert');
      if (alert) throw new Error(`Reschedule validation: ${alert.textContent || 'rejected'}`);
      if (!dateInput.value || !timeInput.value) throw new Error(`Date/time missing: ${dateInput.value} ${timeInput.value}`);
      const requestSummary = requests.map((request) => `${request.init?.method || 'GET'} ${request.url} ${String(request.init?.body || '')}`).join('\n');
      expect(requests.some((request) => request.url.endsWith('/actions') && JSON.parse(String(request.init?.body)).action === 'reschedule'), requestSummary).toBe(true);
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Delivery date updated.'));
    expect(screen.queryByText('RCP-TODAY')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Tomorrow/ }));
    expect(screen.getByText('RCP-TODAY')).toBeInTheDocument();
  });

  it('previews and sends reminder through email-only action, and closes on Escape', async () => {
    const { requests } = setupDeliveryPage();
    await screen.findByText('RCP-TODAY');
    await userEvent.click(screen.getAllByRole('button', { name: 'Send reminder' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Send delivery reminder' });
    expect(within(dialog).getByText('sam@example.test')).toBeInTheDocument();
    expect(within(dialog).getByText(/Email only/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getAllByRole('button', { name: 'Send reminder' })[0]);
    const reopened = screen.getByRole('dialog', { name: 'Send delivery reminder' });
    await userEvent.click(within(reopened).getByRole('button', { name: 'Send email reminder' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Delivery reminder email sent.'));
    const reminderRequest = requests.find((request) => request.url.endsWith('/actions') && JSON.parse(String(request.init?.body)).action === 'reminder');
    expect(reminderRequest).toBeDefined();
    expect(reminderRequest?.url).toContain('/deliveries/RCP-TODAY/actions');
    expect(reminderRequest?.init?.method).toBe('POST');
  });
});
