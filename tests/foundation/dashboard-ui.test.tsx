import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../../src/features/dashboard/DashboardPage';

const summary = {
  period: { start: '2026-11-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z', timezone: 'UTC' },
  kpis: {
    salesCount: 0,
    salesValue: '0.00',
    revenue: '0.00',
    paymentsDue: '0.00',
    grossProfit: null,
    netProfit: null,
    stockValue: '0.00',
    lowStockCount: 0,
    returnCount: 0,
    returnValue: '0.00',
  },
  salesTrend: [],
  paymentOverview: [],
  fulfillmentOverview: [],
  topProducts: [],
  lowStockProducts: [],
};

it('renders persisted-data empty states and discloses unavailable net profit', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: summary, requestId: 'dashboard-test' }), {
        status: 200,
      }),
    ),
  );
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  expect(await screen.findByText('No sales in this period')).toBeInTheDocument();
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
});
