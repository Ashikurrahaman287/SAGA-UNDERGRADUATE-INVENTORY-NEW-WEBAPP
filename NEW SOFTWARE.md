# SAGA Inventory — New Software Specification

## Purpose

Build a clean, production-ready inventory and business operations system for SAGA from scratch. This document defines the required user experience, business workflows, security boundaries, data integrity rules, integrations, and release criteria. It is a product specification, not a claim that the current application already meets every requirement.

## Product Goals

- Manage products, stock, customers, sales, fulfillment, payments, and reporting from one system.
- Keep business data accurate under concurrent use, retries, and partial network failure.
- Support exactly three operational roles: Admin, Moderator, and Rider.
- Enforce authorization in both the user interface and every server/API/database boundary.
- Make the production website usable on desktop and mobile, including direct route navigation and refresh.
- Keep credentials and provider secrets server-side.

## Roles and Access

| Module / action | Admin | Moderator | Rider |
|---|---:|---:|---:|
| Dashboard and business analytics | Full | No admin dashboard; operational views only where needed | No |
| Products and stock | Full | View/create/edit and daily stock operations | No |
| Customers | Full | View/create/edit | Only customer details for assigned deliveries |
| Sales / new sale / sales history | Full | View/create/manage sales | No |
| Packaging | Full | View/update packaging | No |
| Delivery | Full | Manage deliveries | Assigned deliveries only |
| Suppliers and sellers | Full | No | No |
| SMS/email sending and administration | Full | No administrative access | No |
| Reports, accounting, costs | Full | No | No |
| Returns/refunds | Full | Only if explicitly enabled by business policy | No |
| CRM/loyalty, investments, system settings | Full | No | No |
| User and role administration | Full | No | No |

Authorization rules:

- The server derives role and organization from trusted authenticated identity/membership data. Never trust a role, organization, rider ID, or permission sent by the browser.
- The client may hide unavailable navigation, but every endpoint and database policy must independently enforce access.
- Riders can only read and update deliveries assigned to their authenticated identity. Requests for another rider's delivery must return `404` or `403` without leaking its contents.
- Admin-only actions must stay Admin-only even when invoked directly by URL or API request.
- Moderator access is limited to products, customers, sales, sales history, packaging, and delivery.
- Shared role passwords identify a role, not an individual. Prefer individual user accounts with a role assignment; audit records must identify the authenticated user.

## Authentication and Sessions

- Login screen offers Admin, Moderator, and Rider selection and accepts the matching account identity and password.
- Password verification occurs server-side. If shared role credentials are required, read `ADMIN_PASSWORD`, `MOD_PASSWORD`, and `RIDER_PASSWORD` only in server runtime configuration.
- Do not store plaintext passwords in the database, source code, browser storage, API responses, logs, or public build variables.
- Use a well-supported identity provider or securely hashed individual passwords, HTTP-only cookies, `Secure` cookies over HTTPS, appropriate `SameSite`, CSRF protection for state-changing requests, session rotation at login, expiry, refresh/revocation, and logout.
- Rate-limit login attempts using a shared/persistent store suitable for serverless deployments. Do not rely on per-process memory for production limits or sessions.
- Return a non-sensitive auth status response. Expired sessions must lead back to login rather than an indefinite loading state.
- Record role and account identity in security/audit events. Do not log credentials, session tokens, or provider secrets.

## Application Modules

### 1. Dashboard

- Admin overview of sales, revenue, payments due, profit, stock value, low stock, returns, and fulfillment status.
- Date-range filters and links into source records.
- Every metric must be computed from persisted records with documented formulas; exclude cancelled/reversed transactions where appropriate.
- Moderator and Rider must not receive Admin analytics or financial summaries.

### 2. Products and Inventory

- Product catalog with name, SKU/stock code, category, cost price, selling price, supplier, active state, and quantity.
- Search, category/supplier filters, sorting, pagination, product detail, create/edit, and safe archive/delete behavior.
- Stock adjustments require a reason and create immutable stock movement history.
- Prevent negative stock and invalid prices. Record sale, return, cancellation, and manual adjustment movements.
- Show low-stock thresholds and stock alerts.

### 3. Customers, Suppliers, and Sellers

- Customer profile: name, phone, email, delivery addresses, notes, purchase history, totals, and consent/preferences for communications.
- Supplier contact details and product relationships.
- Seller/operator records for sale attribution where the business needs them; these are business records, not an additional login role.
- Validate and normalize phone/email input. Apply organization scoping to all records.

### 4. Sales and Sales History

- New-sale workspace with product search, cart, quantity controls, customer selection/creation, discount, delivery fee, payment method, amount paid, delivery address/schedule, and notes.
- Server recalculates all prices and totals from authoritative product/customer data. Never trust client-supplied prices or line subtotals.
- Sale receipt with unique receipt number and printable/downloadable view.
- Search/filter sales by receipt, customer, seller, date, payment state, and fulfillment status.
- Sales history is auditable. Avoid hard deletion; use cancellation/return flows that restore stock through a transaction.

### 5. Packaging and Delivery

- Packaging queue, packed status, optional packaging cost, and transition to ready for delivery.
- Delivery queue with customer name, phone, address, order lines, schedule, amount due, assignment, and status.
- Admin can assign/reassign a delivery to an active Rider in the same organization.
- Rider sees only assigned deliveries and the minimum customer/order data needed to fulfill them. Do not return customer email, unrelated records, or administrative controls to Riders.
- Rider may update allowed progress states and mark an assigned order delivered; record collection/payment information with actor and timestamp.
- Moderator can run daily packaging and delivery operations but cannot configure communications or access restricted modules.
- Enforce valid status transitions and prevent completion of cancelled/unassigned orders.

### 6. Payments, Returns, and Refunds

- Track amount due, amount paid, payment method, collection time, and collector.
- Partial payments must be supported if the business requires them. Never silently mark the full invoice paid when only part was collected.
- Returns validate original sale and returned quantities. Refund/restock actions must be authorized and idempotent.
- Record refund method, amount, reason, approval, restock decision, and accounting impact.

### 7. Reports and Accounting

- Admin reports: sales, stock, customers, product performance, payments, returns, and operational costs.
- Accounting ledger with chart of accounts, journal entries, receivables/payables, cash/bank accounts, periods, and financial statements if accounting is in launch scope.
- Financial writes must be balanced, transactional, permission-checked, and auditable.
- Operational costs require category, date, amount, description, creator, and accounting linkage.
- Keep finance APIs and records inaccessible to Moderator and Rider.

### 8. Communications

- SwiftSMS sending, balance lookup, provider response handling, delivery/error status, and immutable send logs.
- Email templates for receipts, delivery reminders, cancellation, and campaigns using the chosen provider.
- All provider credentials remain server-side. Never claim delivery unless the provider confirms it.
- Consent, rate limits, recipient validation, safe retries, and duplicate-send prevention are required.
- Admin controls configuration and campaigns. Transactional messages may be triggered by business workflows without exposing provider settings to Moderator or Rider.

### 9. Settings and Administration

- Organization/business identity, currency, timezone, receipt settings, low-stock threshold, and notification preferences.
- Admin-managed users, role assignment, account activation/deactivation, and Rider assignment eligibility.
- Audit log for authentication, role changes, product/stock changes, sales, payments, delivery, returns, settings, and communications.
- Never return secret-valued settings in API responses. Credentials are environment/provider configuration, not editable ordinary settings.

### 10. Optional Business Extensions

Keep these as separately permissioned modules and add only if they are confirmed requirements:

- CRM and loyalty programs, tiers, points ledger, rewards, and redemption.
- University/route delivery grouping.
- Investor records, ownership, distributions, and approvals.
- Email/SMS marketing campaigns.

## Critical Business Workflow

`Product → Customer → Sale → Stock deduction → Sales history → Packaging → Rider assignment → Delivery → Payment collection → Dashboard/report updates`

The implementation must guarantee:

1. A sale, its line items, stock movements, and stock deduction commit atomically.
2. Sale totals are calculated server-side using authoritative current prices and documented discount/fee ordering.
3. An idempotency key prevents duplicate sales and stock deductions on retry.
4. Insufficient stock rejects the entire sale without partial writes.
5. Cancellation/return restores stock exactly once and leaves an audit trail.
6. Packaging/delivery/payment states remain consistent with the sale record.
7. Dashboard/report totals reconcile to persisted transaction records.
8. Repeated delivery/payment requests do not create duplicate payments or notifications.
9. Every state-changing operation records actor, timestamp, entity, and relevant before/after values.

## Data and Database Requirements

Core entities:

- Organizations and memberships
- Users/auth identities and role assignments
- Products, categories, suppliers, and stock movements
- Customers, sellers/operators, and addresses
- Sales, sale items, idempotency requests, payments, and receipts
- Rider delivery assignments and delivery events
- Packaging and status history
- Returns, return lines, refunds, and restocking events
- Operational costs and accounting records (if in scope)
- SMS/email logs and consent records
- Settings and audit logs

Database requirements:

- Use relational constraints, foreign keys, unique receipt/SKU rules scoped to organization where appropriate, nonnegative amount/quantity checks, and indexes for actual query patterns.
- Every tenant-owned record must include organization scope and be filtered from trusted server context.
- Enable and test row-level security on every exposed Supabase table. Service-role credentials must never reach the browser.
- Rider policies must constrain sales and line items to that Rider's assigned deliveries.
- Migrations must be numbered, additive/backward-compatible where possible, tested against staging, and preserve production data. Never reset/drop production to resolve a deployment problem.
- Store money as fixed-precision numeric or integer minor units, never floating point.
- Store timestamps consistently in UTC and format them using the configured business timezone.

## API and Frontend Requirements

- Use a documented API contract with schema validation, consistent status codes, safe error responses, pagination, filtering, and request IDs.
- Separate UI navigation permissions from backend authorization policies.
- Provide loading, empty, error, retry, and unauthorized states. Every loading state must have a finite timeout or explicit recovery path.
- Production API calls must be same-origin unless a documented cross-origin setup is intentional. Never point production requests to localhost.
- Use route-level code splitting so dashboard/report/finance pages are not all downloaded before the login/home screen renders.
- Support keyboard navigation, accessible labels/focus, responsive layouts, and mobile delivery workflows.
- Do not expose debug mocks or test credentials in production bundles.

## Production and Operations

- Deploy the frontend as a Vite build and the API as serverless functions (or an explicitly selected managed Node service). Keep deployment configuration aligned with the actual architecture.
- Vercel project root must include the package manifest, `api/`, and deployment config. Build output must match Vite's output directory.
- Configure Production and Preview environment variables separately. Production secrets must not be prefixed with `VITE_`.
- Make the intended production domain publicly reachable if this is a public app; verify Deployment Protection and domain-to-deployment assignment.
- Use persistent storage/services for sessions, rate limits, uploads, jobs, and event delivery; serverless local memory/files are not durable.
- Add structured logs, health/readiness endpoints, error monitoring, backups, restore procedures, and deployment rollback guidance.
- Do not depend on Docker or Telegram for the new version unless those become explicit requirements.

## Testing and Acceptance Criteria

### Automated tests

- Unit tests for money calculations, discounts, stock availability, status transitions, permissions, and validation.
- API authorization tests for Admin, Moderator, Rider, anonymous requests, role tampering, organization isolation, and cross-rider access.
- Database/RLS tests for direct REST/RPC access as each role.
- Integration tests for atomic sale + stock deduction, idempotent retries, cancellation/return restock, payment collection, and dashboard reconciliation.
- Provider tests using mocks for SMS/email error/timeout/retry behavior; live sends only in a controlled environment with explicit credentials.
- TypeScript check, lint, unit/integration suite, and production build must pass in CI.

### Role acceptance tests

- Admin can access and manage all enabled modules.
- Moderator can use Products, Customers, Sales, Sales History, Packaging, and Delivery; every other module/API returns forbidden.
- Rider sees assigned deliveries only, can see required contact/order details, and can update/complete only assigned deliveries. All other APIs and another Rider's delivery are denied.
- Logout expires/revokes the session; expired sessions return to login; role changes cannot be made via request payload or browser storage.

### Production smoke tests

- Homepage returns HTTP 200 with valid HTML, JS, and CSS.
- `/api/health` returns HTTP 200 JSON.
- Unauthenticated auth-status returns HTTP 200 with `authenticated: false` and renders login, not an endless spinner.
- Login and logout work over HTTPS with HTTP-only cookies.
- Refreshing all authorized client routes returns the SPA, not a hosting 404.
- API health/auth/data endpoints are not intercepted by SPA rewrites or deployment protection unexpectedly.
- Supabase-backed CRUD and business workflow work in a staging environment before production release.

## Suggested Delivery Phases

1. **Foundation:** identity, organization model, permissions, audit, schema/migrations, CI, deployment smoke tests.
2. **Core operations:** products/stock, customers, sales, receipts, idempotent transactions, packaging, delivery assignment, Rider workflow, payments.
3. **Admin operations:** suppliers, sellers/operators, dashboard, reports, settings, communications.
4. **Finance and returns:** accounting, costs, refunds, returns, reconciliation.
5. **Optional extensions:** CRM/loyalty, university delivery, investor management, marketing campaigns.

Do not begin later phases until the prior phase passes its security and data-integrity acceptance tests.
