export type DashboardMoney = number | string;
export type DashboardSummary = {
  currency?: string;
  period: { start: string; end: string; timezone: string };
  kpis: {
    salesCount: number;
    salesValue: DashboardMoney;
    revenue: DashboardMoney;
    paymentsDue: DashboardMoney;
    grossProfit: DashboardMoney | null;
    netProfit: DashboardMoney | null;
    stockValue: DashboardMoney;
    lowStockCount: number;
    returnCount: number;
    returnValue: DashboardMoney;
  };
  salesTrend: Array<{ day: string; sales_count: number; revenue: DashboardMoney }>;
  paymentOverview: Array<{ payment_status: string; order_count: number; amount: DashboardMoney }>;
  fulfillmentOverview: Array<{ fulfillment_status: string; order_count: number }>;
  topProducts: Array<{
    product_id: string | null;
    product_name: string;
    sku: string;
    quantity_sold: DashboardMoney;
    sales_value: DashboardMoney;
  }>;
  lowStockProducts: Array<{
    id: string;
    product_name: string;
    sku: string;
    quantity: DashboardMoney;
    low_stock_threshold: DashboardMoney;
    unit: string;
  }>;
};
export type DashboardResponse = { data: DashboardSummary; requestId: string };
