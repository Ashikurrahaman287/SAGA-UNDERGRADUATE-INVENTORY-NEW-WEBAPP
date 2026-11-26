# Architecture

## Boundaries

The Vite React client owns presentation, routing, interaction, and cache state. Same-origin requests go through `src/lib/api/client.ts`; UI code does not perform database operations. Vercel functions in `api/` own request validation, authorization, safe responses, and server-only provider access. Supabase provides PostgreSQL and Auth; organization-scoped policies and transaction RPCs protect business data and workflows.

`api/lib/supabase.ts` is server-only and accepts the service-role key only from server runtime variables. `src/lib/supabase/browser.ts` can create a browser client only from the public URL and anon key.

## Current folders

- `src/app`: application providers and route wiring.
- `src/components`: reusable UI primitives.
- `src/features`: dashboard, products, sales, customers, fulfillment, returns, suppliers, communications, and settings workflows.
- `src/lib`: API, configuration, Supabase, and utility boundaries.
- `api`: Vercel serverless functions and backend utilities.
- `tests/foundation`: focused API, workflow, and UI contract tests.
- `supabase`: numbered database migrations, test SQL, and development seed data.
- `docs`: operational and architectural guidance.

Feature areas include authentication, products, inventory, customers, sales, packaging, delivery, payments, returns, reports, and settings. Changes to persisted workflows require server authorization, organization scope, reviewed migrations, and tests.

Authentication is a backend-for-frontend boundary under `api/auth`. Supabase SSR handles HttpOnly cookie sessions and server-side refresh; the React client calls same-origin status/login/logout/recovery endpoints and keeps no authorization tokens or role claims in browser storage.

Authorization is centralized in `src/lib/permissions` and `api/lib/auth/authorization-context.ts`. Frontend guards are presentation and route controls; server permission checks, resource ownership checks, and Supabase RLS remain mandatory security boundaries.

The authenticated UI is a nested `AppLayout` with reusable sidebar, header, breadcrumbs, page composition, and state components under `src/components/layout` and `src/components/common`. Module routes are filtered by the shared permission registry and enforce authorization again in the API and database.

The Admin dashboard uses a single organization-scoped summary endpoint backed by a PostgreSQL aggregation RPC. Financial calculations remain database-side; unavailable accounting metrics are disclosed in the UI.

Products and inventory use organization-scoped RPC workflows for opening stock and adjustments. The database prevents direct quantity writes and keeps stock movements append-only; catalog routes use the same permission registry as the server.

Customers use the existing organization-scoped records with server-side list aggregation, append-only notes, transactional default-address switching, and Admin-only consent mutation. General customer data is never exposed to Riders.

Returns use an organization-scoped PostgreSQL transaction RPC that validates cumulative quantities, historical prices, restock decisions, refunds, idempotency, and audit writes. Supplier and seller management reuse the existing product/sales foreign keys and are Admin-only business-record modules. Sellers never become authentication roles. Sales creation uses an organization-scoped PostgreSQL transaction RPC for authoritative totals, stock deductions, payment records, receipt generation, and idempotency.

## Deployment architecture

Vercel serves the Vite `dist` output and runs files in `api/` as serverless functions. `vercel.json` sends non-API paths to the SPA entry point and preserves `/api/*` requests. Supabase remains an external managed dependency. Verify production connectivity, Auth, RLS, and provider workflows in an isolated staging deployment before launch.
