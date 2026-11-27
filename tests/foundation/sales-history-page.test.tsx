import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../src/features/auth/auth-store';
import { SalesHistoryPage } from '../../src/features/sales/SalesHistoryPage';

type TestSale = {
  id: string;
  receipt_number: string;
  fulfillment_status: string;
  created_at: string;
  total_amount: string;
  amount_paid: string;
  confirmed_paid: string;
  amount_due: string;
  payment_status: string;
};

function makeSale(id: string, receipt: string, fulfillmentStatus: string): TestSale {
  return {
    id,
    receipt_number: receipt,
    fulfillment_status: fulfillmentStatus,
    created_at: '2026-11-25T10:00:00.000Z',
    total_amount: '100.00',
    amount_paid: '0.00',
    confirmed_paid: '0.00',
    amount_due: '100.00',
    payment_status: 'unpaid',
  };
}

function setupSalesHistory(role: 'admin' | 'moderator') {
  vi.stubGlobal('crypto', { randomUUID: () => 'sales-cancel-test-key' });
  const pendingSale = makeSale('00000000-0000-4000-8000-000000000001', 'SAGA-PENDING', 'pending');
  let rows = [
    pendingSale,
    makeSale('00000000-0000-4000-8000-000000000002', 'SAGA-DELIVERED', 'delivered'),
    makeSale('00000000-0000-4000-8000-000000000003', 'SAGA-CANCELLED', 'cancelled'),
  ];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.startsWith('/api/sales?')) {
      return new Response(
        JSON.stringify({
          data: rows,
          total: rows.length,
          summary: {
            totalSales: rows.length,
            totalSalesValue: '300.00',
            amountCollected: '0.00',
            outstandingAmount: '300.00',
            paidSales: 0,
            partiallyPaidSales: 0,
            unpaidSales: rows.length,
          },
          page: 1,
          pageSize: 25,
          requestId: 'sales-history-test',
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/actions')) {
      rows = rows.map((row) =>
        row.id === pendingSale.id ? { ...row, fulfillment_status: 'cancelled' } : row,
      );
      return new Response(
        JSON.stringify({ data: { cancelled: true, restocked: true }, requestId: 'cancel-test' }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Unexpected request' } }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const authValue: AuthContextValue = {
    status: 'authenticated',
    session: {
      authenticated: true,
      user: { id: 'user-id', name: 'Test User' },
      organization: { id: 'org-id', name: 'SAGA', currency: 'BDT', timezone: 'Asia/Dhaka' },
      role,
    },
    csrfToken: 'csrf-token',
    refresh: async () => undefined,
    logout: async () => undefined,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <SalesHistoryPage />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return { requests };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Sales History cancellation', () => {
  it('lets admins confirm cancellation, records a reason, and refreshes the sale status', async () => {
    const { requests } = setupSalesHistory('admin');
    await screen.findByText('SAGA-PENDING');

    expect(screen.getAllByRole('button', { name: 'Cancel order' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await userEvent.type(screen.getByLabelText('Reason (optional)'), 'Entered by mistake');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith('/actions'))).toBe(true);
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'SAGA-PENDING cancelled and stock restored.',
      ),
    );
    const cancelRequest = requests.find((request) => request.url.endsWith('/actions'));
    expect(cancelRequest?.url).toBe('/api/deliveries/00000000-0000-4000-8000-000000000001/actions');
    expect(cancelRequest?.init?.method).toBe('POST');
    expect(cancelRequest?.init?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token' });
    expect(JSON.parse(String(cancelRequest?.init?.body))).toMatchObject({
      action: 'cancel',
      notes: 'Entered by mistake',
    });
    await waitFor(() => {
      const saleRow = screen.getByText('SAGA-PENDING').closest('tr');
      expect(saleRow).not.toBeNull();
      expect(within(saleRow as HTMLElement).getByText('cancelled')).toBeInTheDocument();
      expect(
        within(saleRow as HTMLElement).queryByRole('button', { name: 'Cancel order' }),
      ).not.toBeInTheDocument();
    });
  });

  it('hides cancellation from moderators', async () => {
    setupSalesHistory('moderator');
    await screen.findByText('SAGA-PENDING');
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });
});
