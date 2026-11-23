# Products and Inventory

## Scope

Task 07 implements the product catalog, organization-scoped categories, product details, stock history, low-stock filtering, atomic opening stock, manual adjustments, and safe archive behavior. Supplier administration remains a future module; existing supplier relationships are displayed where the current user's RLS permits them.

## Data model

`products` stores the authoritative current name, normalized SKU, category/supplier references, numeric prices, quantity, low-stock threshold, unit, active state, and timestamps. `categories` and `suppliers` are tenant-scoped through composite foreign keys. `stock_movements` stores positive movement quantity plus previous/new snapshots, reason, actor, reference, and timestamp. Movement history is immutable.

Migration 014 adds `opening_stock`, `manual_increase`, and `manual_decrease` movement types, a case-normalized SKU index, `create_product_with_opening_stock`, `adjust_product_stock`, and `archive_product` RPCs. It also blocks direct product quantity updates and direct stock movement inserts unless the transaction-local stock-operation guard is set by an RPC. Migration 015 adds product summary counts.

## API endpoints

- `GET /api/products`: validated search, active state, stock status, sort, and stable pagination.
- `POST /api/products`: creates a product and opening-stock movement atomically.
- `GET /api/products/:id`: organization-scoped details.
- `PATCH /api/products/:id`: edits metadata only; quantity cannot be changed here.
- `POST /api/products/:id`: Admin-only safe archive; available stock blocks archive.
- `GET /api/products/:id/stock-movements`: immutable movement history.
- `POST /api/inventory/adjustments`: atomic increase/decrease with mandatory reason and database-level negative-stock protection.
- `GET /api/inventory/low-stock`: server-side low-stock list using the same quantity/threshold rule as the dashboard.
- `GET/POST /api/categories` and `PATCH /api/categories/:id`: category visibility for product operators and Admin-only changes.
- `GET /api/products/summary`: organization-scoped total, active, out-of-stock, and low-stock counts.

Every endpoint uses the verified auth context and centralized permission registry. Organization IDs come from membership context, not request payloads. Rider permissions do not include product access.

## Roles and RLS

Admin has full product/inventory access and category management. Moderator can view/create/edit products and perform stock adjustments, but cannot manage categories or suppliers. Rider and anonymous users receive no product data. Existing RLS policies remain enabled; composite foreign keys enforce tenant-safe relationships, and migration 014 adds database trigger guards for quantity/movement writes.

## Low stock

A product is low stock when it is active and `quantity <= low_stock_threshold`. Out-of-stock is the narrower state `quantity = 0`; an out-of-stock product also satisfies the numeric low-stock condition but is labelled separately in the UI. Dashboard and inventory RPCs use the same expression.

## Transaction flow

1. The server validates the request and resolves the active organization and permission.
2. The database RPC locks the product row where needed.
3. It computes the next quantity from authoritative stored quantity, rejecting negative results.
4. It updates product quantity and inserts the immutable movement in the same transaction.
5. It writes an audit event with actor and before/after quantity.
6. Any failure rolls the entire transaction back.

Opening stock follows the same atomic boundary: product insert, opening movement, and audit event succeed or fail together. Repeated requests should use a future idempotency key at the calling workflow boundary.

## Testing and staging

Local tests cover form validation, SKU normalization, role boundaries, and existing application behavior. Apply migrations 014 and 015 in a disposable Supabase staging project and test Admin/Moderator/Rider identities through REST/RPC for duplicate SKU, organization isolation, opening stock, concurrent `for update` adjustments, negative stock, immutable movement history, archive blocking, and dashboard low-stock consistency. The workspace has no live Supabase CLI/database credentials, so those database-backed tests remain externally pending.
