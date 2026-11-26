# Vercel Production Release Gate

## Build and routing

Deploy from the repository root with the Vite preset, `npm run build`, and `dist` output. Before release, run `npm run typecheck:api` to reproduce the NodeNext server-module check used by Vercel. `vercel.json` applies the SPA fallback only to non-`/api` paths; Vercel functions own `/api/*`. Verify direct refresh on `/app/dashboard`, `/app/communications`, `/app/settings`, `/app/users`, and `/app/audit-logs`.

`GET /api/health` is liveness and must return HTTP 200 JSON. `GET /api/ready` checks required server configuration and a Supabase query; it returns a generic `503` when either dependency is unavailable and never includes connection details.

Run the deployed release smoke test after deployment:

```powershell
$env:SMOKE_BASE_URL = 'https://your-preview-domain'
$env:SMOKE_REQUIRE_READY = '1'
npm run test:smoke
```

For credentialed cookie checks, inject `SMOKE_EMAIL` and `SMOKE_PASSWORD` from the CI secret store, and set `SMOKE_ROLE` to the controlled test account role. Do not write passwords to shell history or commit them. The smoke script without those credentials explicitly skips login/logout cookie assertions; that skip is not a production release pass.

Local static-only checks can run against Vite preview with `SMOKE_STATIC_ONLY=1`. Static-only mode does not verify serverless APIs, Supabase, or cookie behavior.

## Environment checklist

| Variable                        | Browser build                                             | Preview / Production                                              |
| ------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Public configuration only; not used for privileged access | Set only if a browser feature needs the public Supabase endpoint  |
| `VITE_SUPABASE_ANON_KEY`        | Public/anon key only; never use a service key             | Scope to Preview/Production as appropriate                        |
| `SUPABASE_URL`                  | Server-only                                               | Required server runtime variable                                  |
| `SUPABASE_ANON_KEY`             | Server-only                                               | Required for SSR Auth clients                                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only, never `VITE_`                                | Required server runtime variable; tightly restrict project access |
| `AUTH_REDIRECT_URL`             | Server-only                                               | Must point to the deployed same-origin auth callback/reset flow   |
| `SWIFTSMS_API_KEY`              | Server-only, never `VITE_`                                | Add only where live SMS is explicitly enabled                     |
| `EMAIL_PROVIDER`                | Server-only, never `VITE_`                                | Set to `smtp`, `resend`, `postmark`, `sendgrid`, or `none`         |
| `EMAIL_SMTP_HOST`               | Server-only, never `VITE_`                                | Required for SMTP delivery                                        |
| `EMAIL_SMTP_PORT`               | Server-only, never `VITE_`                                | Usually `465` or `587`                                             |
| `EMAIL_SMTP_USER`               | Server-only, never `VITE_`                                | SMTP login                                                         |
| `EMAIL_SMTP_PASSWORD`           | Server-only, never `VITE_`                                | SMTP secret                                                        |
| `EMAIL_FROM_NAME`               | Server-only                                                | Sender name                                                        |
| `EMAIL_FROM_ADDRESS`            | Server-only                                                | Verified sender address                                            |
| `SMOKE_EMAIL`, `SMOKE_PASSWORD` | Never build variables                                     | CI-only controlled test identity secrets                          |

Do not configure `ADMIN_PASSWORD`, `MOD_PASSWORD`, or `RIDER_PASSWORD` for this Supabase individual-account flow. Production secrets must not be copied to Preview unless the Preview project is intentionally isolated and approved.

## Authentication and serverless state

Supabase Auth stores sessions and refresh/revocation state. The API verifies each request with `auth.getUser()` and reloads active memberships, so role and active-state changes affect authorization on the next request. Role/activation mutations also request global session sign-out. Login limits use the Postgres `consume_auth_rate_limit` RPC and fail closed if the persistent limiter is unavailable. CSRF uses a double-submit cookie plus same-origin validation for mutations. No process-local API counters or local filesystem persistence are used.

Cookies must be `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. `/api/auth/me` must return HTTP 200 and `{ authenticated: false }` when anonymous. The smoke script checks those contracts; credentialed cookie assertions require a controlled test account.

## Database and RLS release gate

Apply numbered migrations in order to a disposable/local database, then staging, before production. Run the available SQL tests against staging. Never reset or drop a production database. `supabase/tests/settings_admin_audit.sql` checks public tables for RLS, audit policy/immutability privileges, administration RPC grants, Rider eligibility triggers, and fixed-precision storage. `supabase/tests/rbac_rls_release.sql` exercises Admin, Moderator, Rider, anonymous, cross-organization, direct membership-write, and audit immutability boundaries.

| Public tables                                                             | Expected access boundary                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `organizations`                                                           | Active members read their organization; Admin update only                                                                   |
| `profiles`                                                                | Self read/update; organization user administration uses server allowlists                                                   |
| `memberships`                                                             | Self/Admin read; direct authenticated writes revoked; Admin API/RPC only; tenant/user ownership immutable                   |
| `business_settings`                                                       | Admin table policy; internal server workflows read only allowlisted non-secret fields                                       |
| `categories`                                                              | Admin read/write; Moderator read only                                                                                       |
| `suppliers`, `sellers`                                                    | Admin-only                                                                                                                  |
| `products`                                                                | Admin/Moderator organization-scoped read/write; safe stock/archive workflows use RPCs                                       |
| `stock_movements`                                                         | Staff read; controlled append; immutable history                                                                            |
| `customers`, `customer_addresses`, `customer_notes`                       | Admin/Moderator organization scope; Riders receive only the assigned-delivery DTO, not direct customer-table access         |
| `sales`, `sale_items`                                                     | Admin/Moderator organization scope; writes through the atomic sale workflow; Riders receive only assigned-delivery DTO data |
| `sale_idempotency`, `sale_receipt_sequences`                              | Transaction workflow only; no general client access                                                                         |
| `payments`                                                                | Admin/Moderator read policy; writes via transaction RPC; Rider collection uses assigned delivery workflow                   |
| `receipts`                                                                | Staff read; transactional insert; receipt and line snapshots remain historical                                              |
| `packaging_records`, `packaging_events`                                   | Staff read/write through controlled workflow; event history is append-only                                                  |
| `delivery_assignments`, `delivery_events`                                 | Staff organization scope; Rider limited to assigned records/events and permitted progress operations                        |
| `fulfillment_requests`                                                    | Idempotent workflow RPC only                                                                                                |
| `returns`, `return_items`, `refunds`                                      | Read and transaction access controlled by Admin and the database Moderator-return policy; Rider denied                      |
| `return_receipt_sequences`, `return_idempotency`                          | Return transaction workflow only                                                                                            |
| `expense_categories`, `operational_costs`                                 | Admin-only                                                                                                                  |
| `audit_logs`                                                              | Admin-only read/append; UPDATE/DELETE revoked and trigger-blocked                                                           |
| `communication_consents`, `communication_logs`, `communication_templates` | Admin-only; send/update flows use server API/RPC boundaries                                                                 |
| `communication_rate_limits`                                               | Server-owned persistent throttling; no anonymous/authenticated direct access                                                |
| `auth_rate_limits`                                                        | RLS enabled with no direct table grants; only the parameter-validated limiter RPC is executable                             |

The table matrix describes checked-in policies and RPC intent, not live proof. Test with separate Admin, Moderator, Rider, anonymous, cross-organization, and cross-Rider identities through both PostgREST and application APIs. Rider safety relies on the allowlisted delivery API response; direct reads of customer/sale tables are intentionally not granted to Riders.

## Bundle and secret hygiene

After `npm run build`, run `npm run test:smoke` against the release target. The script scans `dist` for service-role/SMS keys, role passwords, local URLs, and a known debug identity, and verifies dashboard, communications, settings, users, and audit pages are emitted as separate route chunks. Review Vite/Rollup warnings and the final initial-chunk sizes; do not suppress a size warning without a measured split or documented reason.

## Backup, restore, monitoring, and rollback

- Enable Supabase managed backups; use point-in-time recovery where the plan supports it. Define retention and owners for Production separately from Preview.
- Test restore into an isolated project at least before launch and after material schema changes. Validate row counts, tenant policies, Auth identities, and critical sale/delivery/return workflows before considering a restore usable.
- Monitor Vercel function failures/latency and `/api/health`/`/api/ready`; correlate errors using `X-Request-ID`. Monitor Supabase Auth/database availability, connection saturation, migration failures, and backup completion.
- Roll back application code by promoting the last verified Vercel deployment. Schema migrations are additive; use a forward corrective migration for database issues. Do not drop/reset production data as a rollback.
- Keep an incident owner and deployment approver, and capture the deployed commit, migration version, environment scope, smoke result, and rollback target for each release.
