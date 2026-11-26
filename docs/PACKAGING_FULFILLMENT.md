# Packaging and Fulfillment

## Scope

Packaging and fulfillment workflows connect persisted sales, payments, customers, delivery assignments, audit history, and receipts.

## Status model

Packaging uses `packaging_status`: `pending`, `in_progress`, `packed`, `ready`.

Valid transitions:

- `pending -> in_progress -> packed -> ready`
- `in_progress -> pending` is retained as a controlled rollback
- Cancelled sales cannot enter or remain in packaging transitions

Delivery uses `delivery_status`: `unassigned`, `assigned`, `out_for_delivery`, `delivered`, `failed`, `cancelled`.

Valid transitions:

- `unassigned -> assigned`
- `assigned -> out_for_delivery`, `failed`, or `cancelled` by staff
- `out_for_delivery -> delivered` or `failed`
- Cancelled or unassigned deliveries cannot be completed

Rider cross-rider actions are checked inside the database RPC and API; staff can assign/reassign an active Rider in the same organization.

## Transaction and idempotency

Migration 021 adds `fulfillment_requests` and three transaction helpers:

- `transition_packaging`
- `assign_delivery`
- `update_delivery_status`
- `collect_delivery_payment`

Each operation uses an advisory transaction lock, organization and role checks, an operation-specific idempotency key, and a SHA-256 request hash. Reusing a key with the same payload returns the stored response. Reusing it with different data is rejected.

## Payment collection

Payment collection is append-only through `payments`. Completed payments are summed from the persisted table. Collected amount must be positive and cannot make confirmed paid amount exceed `sales.total_amount`. The RPC updates `amount_paid`, `amount_due`, and the `payment_status` enum without JavaScript trust or floating-point database money columns.

## Packing slip

Staff may view `GET /api/packaging`. `/api/deliveries/:saleId/packing-slip` uses the persisted sale, historical address snapshot, and sale-item product/SKU/quantity snapshots. Riders receive it only for their assigned delivery.

## Rider privacy

Rider delivery responses contain only receipt, current due/total, address snapshot, customer name/phone, status, and assignment fields. They exclude customer email, unrelated customer records, notes, financial administration fields, and staff controls.

## RLS

Migration 021 adds indexes and RPC-only fulfillment write policies. Direct staff writes to fulfillment records are not the preferred or authorized path. Existing delivery and packaging read policies remain organization/Rider-scoped. The active Rider API resolves users from active organization membership, not request-supplied Rider IDs.

## Testing

Vitest verifies role boundaries. Staging verification must cover transition matrices, cross-rider status/payment denial, direct REST/RPC access, idempotent retries, partial/full payments, overpayment rejection, cancelled sales, historical packing-slip data, and organization isolation.
