# Settings, User Administration, and Audit

## Settings

`GET /api/settings` and `PATCH /api/settings` require the centralized Admin settings permissions. The API derives organization and actor identity from the verified session and returns only allowlisted, non-secret organization values. Provider credentials and service keys remain server environment variables.

Settings include business name/contact/address, ISO 4217 currency, IANA timezone, low-stock default, receipt prefix/header/footer/notes, notification preferences, and the Moderator returns/refunds policy. Zod validates API input; migration 025 validates tenant authority and constraints again in transactional RPCs.

The configured currency and timezone are exposed as non-secret values in the verified `/api/auth/me` organization context. Operational currency displays use that context. Receipt rendering reads current business identity/presentation and timezone, while sale item prices, totals, product names, SKUs, and historical receipt numbers remain persisted transaction snapshots. The receipt prefix is applied only to new sales/receipts. The low-stock default is used only when creating a new product and does not rewrite existing product thresholds.

## Users and Roles

- `GET /api/admin/users` returns tenant-scoped, paginated memberships and profile/Auth identity details.
- `POST /api/admin/users` invites through Supabase Auth and assigns one of `admin`, `moderator`, or `rider` in the active organization. Organization IDs are not accepted from the request.
- `PATCH /api/admin/users/:id` updates role, active state, or Rider eligibility. Access changes globally revoke Supabase sessions; every request also re-reads current active membership.
- `/api/admin/riders` returns only active Rider memberships whose `rider_eligible` flag is true.

Self-demotion/deactivation and removal of the last active Admin are rejected by the database boundary. Direct authenticated membership writes are revoked so every change passes through attributed Admin RPCs. Invitation membership creation and its role-change audit event commit atomically after Supabase Auth creates the identity. Eligibility is constrained to active Rider memberships and checked again by the delivery-assignment trigger. Memberships are deactivated, not deleted.

## Audit Log

`GET /api/admin/audit-logs` is Admin-only and supports server pagination, substring search across actor/action/entity/reference and snapshots, category, actor, and business-timezone date filters. Before/after JSON is recursively redacted on insert and again before API serialization. A migration backfill redacts legacy snapshots and infers categories where entity type permits; historical actor-role values that were never recorded remain unset rather than being guessed.

Audit rows are append-only at the trigger and privilege layers. Direct RLS read and insert policies are Admin-only. Business RPCs and the server API retain their existing audit writes; Moderator and Rider cannot read or append through the authenticated table policy.

## Migration

Apply `supabase/migrations/025_settings_admin_audit.sql` after migration 024 in a disposable local or staging project first. It adds organization/receipt settings, membership eligibility, audit metadata/indexes, secret redaction, immutable protection, transactional Admin RPCs, and delivery assignment enforcement. It does not drop tables or rewrite sales history. The migration has not been applied in this workspace because Supabase CLI and `psql` are unavailable.

## Verification

Local Vitest tests cover settings validation, unknown-secret stripping, audit snapshot redaction, membership role/lockout rules, and the Admin/Moderator/Rider permission matrix. `supabase/tests/settings_admin_audit.sql` adds pgTAP catalog assertions, while `supabase/tests/rbac_rls_release.sql` exercises role and cross-organization policies against fixtures. Run database tests with `supabase db test` against a disposable/staging database; these SQL tests are not locally executed because no PostgreSQL/Supabase CLI is available.
