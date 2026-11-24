# Sales History

## Architecture

Sales History reuses Task 10's existing `sales`, `sale_items`, `payments`, `receipts`, customer, seller, and organization records. It does not create another transaction or sales table. The read API is server-side and RPC-backed; the UI sends only validated filter, sort, and pagination values.

## Search and filtering

`GET /api/sales` supports receipt/customer/phone/seller search, customer/seller ID, payment status, fulfillment status, business-date range, sort field, direction, and stable page parameters. Search is debounced in the UI and uses parameterized SQL predicates in `list_sales_history`. No raw filter text is inserted into a PostgREST `.or()` string.

Supported sort fields are `created_at`, `receipt_number`, `total_amount`, `amount_paid`, `amount_due`, `customer_name`, and `payment_status`. RPC ordering has the sale ID/time as a stable final tie-breaker.

## Date boundaries

When `from` or `to` is supplied, the API reads the organization timezone and converts date-only boundaries through the existing dashboard date-range utility. Data timestamps remain UTC. A to-date represents the start of the next local day and is passed as an exclusive upper bound.

## Summary formulas

`get_sales_history_summary` independently calculates from valid non-cancelled sales and confirmed payments:

- Total sales: count of valid sales.
- Sales value: sum of `sales.total_amount`.
- Amount collected: sum of completed `payments.amount`; when no completed payment exists, the Task 10 persisted `sales.amount_paid` fallback is used for compatibility.
- Outstanding: sum of `greatest(total_amount - confirmed_paid, 0)`.
- Paid: confirmed paid equals or exceeds sale total.
- Partially paid: confirmed paid is greater than zero and less than total.
- Unpaid: confirmed paid equals zero.

Summary and table use the same filters and date context. The code does not join payments to sales for the row-table query, preventing payment-cardinality duplication.

## Sale detail

`GET /api/sales/:id` returns the sale header, historical sale-item snapshots, chronological payment rows, confirmed-paid aggregate, and existing receipt metadata. `GET /api/sales/:id/payments` returns the header and payment history. Only completed payments are counted as confirmed.

Historical names, SKU values, unit prices, costs, address snapshots, seller references, receipt numbers, and totals come from persisted records. The UI does not recalculate historical prices from current product records.

## Receipt

`GET /api/sales/:id/receipt` returns the persisted organization settings, sale snapshot, and sale-item snapshots. Opening, printing, or revisiting a receipt does not create a new receipt. The dedicated `/app/sales/:id/receipt` route provides a print layout and browser print action.

## Role restrictions

Admin and Moderator use `sales.view`. Rider has no general Sales History permission. Direct `/api/sales` requests are independently denied, and RLS remains an organization boundary. Moderator does not receive seller-administration or Admin-audit permissions merely by viewing a sale.

## Export

No export format was added in this task. The specification makes export optional and no existing export architecture was present, so CSV/XLSX scope remains pending rather than being falsely implemented.

## Migration

Migration 020 adds indexes for organization, timestamp, customer, seller, payment status, fulfillment status, and payment lookup, plus `list_sales_history` and `get_sales_history_summary` RPCs. Apply it to staging before live Sales History verification.

## Testing

The Vitest suite verifies role view permissions, and the existing sale suite verifies minor-unit discount/payment calculations. Staging tests must cover search normalization, date boundaries, payment-status filters, fulfillment filters, sorting tie-breakers, pagination, summary reconciliation, payment pending/voided exclusion, historical receipt fields, direct API/RLS access, and organization isolation.
