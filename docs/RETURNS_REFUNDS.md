# Returns and Refunds

## Scope

Task 13 adds organization-scoped return and refund workflows against persisted sales. It reuses existing `returns`, `return_items`, `refunds`, `sale_items`, `products`, `stock_movements`, `payments`, `audit_logs`, and sale snapshots. It does not implement accounting ledgers or Dashboard analytics.

## Role policy

Admin may create, approve, process, and view returns. Rider is always denied. Moderator is allowed only when `business_settings.moderator_returns_enabled` is true. The database RPC independently checks this policy; navigation/UI hiding is not authorization.

## Quantity validation

Each requested return item must reference a sale item in the same organization/sale. Requested quantity must be positive and whole. Cumulative valid return quantities are checked against original sold quantity:

`previously_returned + requested_quantity <= sale_item.quantity`

Rejected/cancelled return records do not contribute to previously returned quantity. Cancelled sales cannot be returned.

## Financial calculation

Refundable value is calculated from historical `sale_items.unit_price * quantity` and the proportional sale discount ratio:

`round(unit_price * quantity * (1 - sale_discount/subtotal), 2)`

A requested refund is rounded and cannot exceed the server-calculated maximum refundable value. The current product catalog price is never used. Delivery fees are not silently included in item refunds.

## Transaction

Migration 022 adds a return sequence and idempotency table plus `create_return_transaction`. The RPC uses an advisory lock, validates role/policy/sale/items/quantity/refund, creates return, return lines, optional stock movements, refund record, sale payment reconciliation, audit record, and idempotency record atomically.

For `restock`, product quantity is incremented by the returned quantity and an immutable `stock_movements` row is created with `movement_type = 'return'`, before/after quantity, reason, and actor. For `discard`, no stock movement is created.

A retry with the same organization/key and same payload hash returns the original return. A changed payload with the same key is rejected.

## API

- `GET/POST /api/returns`
- `GET /api/returns/:id`
- `GET /api/sales/:id/returns`

Create submission requires reason, restock decision, refund method, idempotency key, sale ID, and sale-item quantities. Client-supplied refund amounts are constrained and never become authoritative before the RPC recalculates them.

## RLS and audit

Return/refund tables remain organization-scoped and staff-readable. Direct insert policies require the `saga.return_transaction` transaction context. Stock and refund writes are RPC-controlled. Audit entries record actor, organization, entity, before/after values, and request ID.

## Testing and staging

Local tests cover proportional refund math and role boundaries. Staging must verify cumulative partial returns, duplicate returns, quantity overrun, historical prices, restock/discard behavior, refund overrun, Moderator policy, cross-organization access, sale payment reconciliation, RLS, and direct REST/RPC denial.
