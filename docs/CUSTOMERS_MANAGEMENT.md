# Customers Management

## Scope

Customer management provides organization-scoped records, validated search/pagination, customer creation and editing, delivery addresses, default-address switching, internal notes, purchase history, customer totals, and consent display. Sales, communications, CRM, and fulfillment workflows use these customer records through their own APIs.

## Data model and migrations

Existing `customers`, `customer_addresses`, `sales`, and `communication_consents` entities are extended by migration 016. Addresses gain labels, recipient contact fields, and active state. `customer_notes` is a new append-only table with author and timestamp. Consent rows gain `updated_by` and `consent_source`. Migration 017 adds numeric customer summary RPCs and organization-level customer metrics.

Customer records are never hard-deleted by this module. Historical sales retain their existing customer relationship and delivery address snapshots. Current address edits therefore cannot rewrite historical transactions.

## Validation and normalization

Customer name and phone are required. Phone input accepts common local/international punctuation and is normalized to digits with an optional leading `+` before storage. Email is optional but, when supplied, must pass Zod email validation and is lowercased by the database creation RPC. Invalid input is rejected rather than silently transformed into a plausible value.

## Totals and purchase history

Valid purchases are sales belonging to the organization and customer with `fulfillment_status <> 'cancelled'`. Total orders count those sales; total purchase sums `sales.total_amount`; average order value is the numeric average of those totals; last purchase is the maximum sale timestamp. Multiple payments or sale items do not multiply rows because aggregation is performed directly over sales. Customer purchase totals are gross sales and are not netted against returns/refunds.

The list RPC performs the same aggregation server-side and supports search by name, normalized phone, or email, purchase activity filters, stable sorting, and pagination. The profile purchase-history endpoint returns an allowlisted sale summary without unrelated customer data.

## Addresses, notes, and consent

Address writes require the customer and organization relationship through RLS/composite keys. `set_default_customer_address` clears the prior default and sets exactly one active address in one database transaction. Notes are visible to Admin and Moderator users, append-only, and preserve the author. Communication consent is separate from contact availability: absent rows render as `unknown`. Transactional order and delivery emails may be sent for unknown consent, but explicit email opt-outs are honored. Consent mutation requires the Admin-only `communications.manage` permission and records updater/source metadata.

## API endpoints

- `GET/POST /api/customers`
- `GET/PATCH /api/customers/:id`
- `GET /api/customers/summary`
- `GET /api/customers/:id/summary`
- `GET /api/customers/:id/purchase-history`
- `GET/POST /api/customers/:id/addresses`
- `PATCH/POST /api/customers/:id/addresses/:addressId`
- `POST /api/customers/:id/notes`
- `POST /api/customers/:id/consent`

All general endpoints require verified Admin or Moderator customer permissions and derive organization from the authenticated membership. There is intentionally no general Rider customer endpoint. A future delivery endpoint must return a narrow assigned-delivery DTO containing only necessary name, phone, address, and order fields.

## RLS and audit

Existing customer/address RLS policies permit Admin and Moderator organization-scoped access. Rider and anonymous users have no customer-table policy. Notes add staff read/insert policies and no update/delete grants. Consent remains Admin-only. Creation and future state changes should write audit records with actor, organization, entity, and request ID; the customer creation RPC writes a creation audit event.

## Testing and staging

Local tests cover required phone/email validation, Admin/Moderator/Rider permission boundaries, and the existing application suite. Apply migrations 016 and 017 in disposable Supabase staging, then test organization isolation, default-address concurrency, historical snapshot preservation, cancelled-sale exclusion, note privacy, unknown consent, and direct REST/RPC access as each role. Live RLS and database execution remain pending because this workspace has no configured Supabase project or CLI.
