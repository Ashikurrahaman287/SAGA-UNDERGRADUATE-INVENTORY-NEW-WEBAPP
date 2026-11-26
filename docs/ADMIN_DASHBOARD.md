# Admin Dashboard

## Architecture

The Admin dashboard is available at `/app/dashboard`. The browser calls `GET /api/dashboard/summary`; the endpoint requires the centralized `dashboard.view` permission, derives the active organization from the verified Supabase session, reads the organization timezone, validates the requested date range, and calls the PostgreSQL `get_dashboard_summary` RPC. The browser never filters raw sales or chooses an organization scope.

Migration `013_dashboard_analytics.sql` performs aggregation inside PostgreSQL using RLS-visible records. It returns KPI values, daily sales trend, payment status distribution, fulfillment status distribution, top products, and low-stock products in one response to avoid N+1 requests and duplicate joins.

## Metric definitions

| Metric       | Source and calculation                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total sales  | Count and sum of `sales.total_amount` where `organization_id` matches trusted context, `created_at` is in the range, and `fulfillment_status <> 'cancelled'`.           |
| Revenue      | The current operational definition is recognized valid sales value, equal to the filtered `sales.total_amount` sum. It is not cash collected or net accounting revenue. |
| Payments due | Sum of authoritative `sales.amount_due` for valid filtered sales. Partial payment states remain outstanding until their recorded balance is zero.                       |
| Gross profit | Sum of `sale_items.line_total - sale_items.unit_cost_snapshot * sale_items.quantity` for valid filtered sales. This is gross profit only.                               |
| Net profit   | Gross profit less operational costs and internal packaging costs for valid sales in the selected business-date range. This is an operational estimate, not a double-entry accounting statement. |
| Stock value  | Sum of active `products.quantity * products.cost_price` across the organization.                                                                                        |
| Low stock    | Active products where `quantity <= low_stock_threshold`, with a count and allowlisted product rows.                                                                     |
| Returns      | Count and sum of `returns.total_amount` where status is `approved` or `processed` and the return date is in range.                                                      |
| Fulfillment  | Count of valid sales grouped by the implemented `sales.fulfillment_status` enum. Cancelled sales are excluded.                                                          |
| Top products | Valid sale items grouped by product snapshot, ranked by summed quantity and limited to ten rows.                                                                        |

All money and quantity arithmetic occurs in PostgreSQL numeric columns. The frontend formats returned values but does not calculate financial totals.

## Date filtering

The endpoint accepts optional `from` and `to` date-only parameters. If omitted, it uses the most recent 30 business dates. Date boundaries are interpreted in the organization timezone and converted to UTC before the RPC query. Ranges must be ordered and no longer than one year. Database timestamps remain UTC.

The UI supports Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, This year, and Custom range. Refresh re-runs the same query key and does not change the selected range.

## Authorization

Only Admin memberships satisfy `dashboard.view`. Moderator and Rider roles have no dashboard permission, and the shell renders an unauthorized state for direct dashboard URLs. The API independently enforces the same permission and RPC access checks the trusted organization with `public.is_admin`. Organization IDs from the browser are never accepted as authorization.

## UI behavior

KPI cards link to the relevant sales, payments, inventory, and returns views. Trend, payment, fulfillment, top-product, and low-stock widgets have independent empty and loading states. Net profit is shown only when its required accounting inputs are available.

## Testing and staging

Automated tests cover date boundary validation, Admin-only permission mapping, and dashboard calculations. Verify direct API/RPC access, organization isolation, cancelled-sale exclusion, partial balances, stock valuation, and reconciliation against fixture records in an isolated staging project.
