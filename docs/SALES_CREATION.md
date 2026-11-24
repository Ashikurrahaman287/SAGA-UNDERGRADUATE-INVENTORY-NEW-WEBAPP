# Sales Creation

## Architecture

Task 10 implements a server-authoritative New Sale workspace and a single PostgreSQL transaction RPC. The React page submits only product IDs, quantities, customer/seller IDs, discount input, delivery fee, payment input, address/schedule, notes, and a UUID idempotency key. It never sends a unit price, line subtotal, final total, organization ID, role, or stock balance.

## Calculation rules

Money uses numeric database columns and integer minor units in the frontend preview. Fixed discounts subtract a fixed amount from the merchandise subtotal. Percentage discounts calculate `subtotal * percentage / 100` and round to cents. The delivery fee is not discounted. Final total is `subtotal - discount + delivery fee`. Amount due is `final total - confirmed initial payment`. An overpayment is rejected.

Payment status is `paid` when due is zero, `partial` when an initial payment is positive but due remains, and `unpaid` when no payment is confirmed.

## Transaction

Migration 019 creates a receipt sequence and `create_sale_transaction` RPC. The RPC takes an advisory transaction lock for the organization/idempotency key, validates active organization membership and role, loads and locks product rows, verifies active status and stock, calculates authoritative prices, deducts stock, inserts immutable sale movements, creates sale items with price/cost snapshots, creates the initial payment and receipt, creates an initial packaging record, writes idempotency and audit rows, and commits atomically.

A retry with the same key and the same canonical request hash returns the original sale data. A retry with the same key and different payload is rejected. Concurrent retries are serialized by the advisory lock. Only the RPC is allowed to create sale, item, payment, receipt, packaging, and idempotency rows through transaction-local settings.

## Inventory

For each item the RPC locks the product row, requires a positive whole quantity, rejects inactive or insufficient-stock products, and sets the next quantity with an immutable `sale` stock movement. Before/after quantities and actor identity are persisted. No negative quantity is allowed.

## Receipt

Receipt numbers are unique within an organization and generated from an organization sequence with a UTC date prefix. The receipt table snapshots the generated receipt and financial totals. The UI provides a print view and a sale-detail view. SMS/email receipt delivery is not implemented.

## Customer and seller

Customer and seller IDs are nullable or optional as defined by the existing form policy, but if supplied they must belong to the active organization. Archived sellers are rejected by the RPC. Delivery addresses are stored as JSON snapshots and later address edits cannot change the sale snapshot. Sales without a seller remain supported.

## API and UI

- `POST /api/sales` creates an atomic sale and is Admin/Moderator authorized.
- `GET /api/sales` provides organization-scoped paginated history.
- `GET /api/sales/:id` returns sale, items, payments, and receipt.
- `GET /api/sales/:id/receipt` returns printable receipt data.

The New Sale page provides product search, cart quantity controls, customer/seller selection, fixed/percentage discount preview, delivery fee, payment, address/schedule, notes, duplicate-submit protection, and a success receipt. Loading, empty, error, insufficient-stock, and unauthorized states are handled by the existing shell and API utilities.

## Security and RLS

Sales creation requires `sales.create`. Sales/history reads require `sales.view`. Rider and anonymous users receive no sale endpoint access. Organization scope is derived from the trusted membership. Direct writes to sale items, payments, receipts, packaging, and idempotency records are blocked outside the sale RPC. RLS remains an independent boundary.

## Testing and staging

The Vitest suite covers fixed/percentage calculations, partial payment, overpayment, and percentage-range validation. Apply migration 019 to disposable staging, then test role access, organization boundaries, concurrent stock, idempotent retries, changed-payload keys, receipt uniqueness, stock movements, payment status, and dashboard reconciliation using isolated fixture identities. Live database execution and real-role browser testing remain pending because no Supabase project or credentials are configured in this workspace.
