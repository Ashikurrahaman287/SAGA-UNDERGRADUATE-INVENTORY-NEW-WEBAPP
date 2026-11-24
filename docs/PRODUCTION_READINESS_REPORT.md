# Production Readiness Report

## Summary

Task 17 hardening and release tooling are implemented in the workspace. This is not a certification of production readiness: no Vercel deployment URL, Supabase credentials, staging Auth identities, or database CLI are available in this environment. Migration execution, live RLS, cross-tenant access, provider delivery, and credentialed cookie smoke remain release blockers until completed against staging.

## Audit Results

| Area                              | Finding / status                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel routing                    | Vite output is `dist`; checked-in rewrite excludes `/api/`; deep-route refresh and function routing require deployed smoke verification                                                                   |
| Health                            | `/api/health` is process liveness and returns non-sensitive JSON                                                                                                                                          |
| Readiness                         | `/api/ready` now checks configuration plus a Supabase query, returns generic 503 on failure, and exposes no connection string                                                                             |
| Sessions                          | Supabase Auth SSR cookies are HttpOnly/SameSite=Lax and Secure in production; active membership is reloaded per request; access changes request global sign-out                                           |
| CSRF                              | Double-submit token and same-origin checks protect state-changing auth and admin endpoints                                                                                                                |
| Login rate limits                 | Persistent PostgreSQL RPC; now fail closed when the database limiter errors                                                                                                                               |
| Public-table RLS                  | Checked-in migrations enable RLS across application tables; see the full per-table matrix in `VERCEL_DEPLOYMENT.md`. Catalog and role-matrix tests added; SQL execution awaits staging                    |
| Audit/communications immutability | Audit has update/delete revokes plus an immutability trigger; communication log immutability is defined in migration 023. Verify effective grants/RLS in staging                                          |
| Tenant/Rider boundaries           | APIs derive organization and Rider identity from verified membership/session. Rider has no direct customer/sale table access and receives an allowlisted assigned-delivery response                       |
| Money/timestamps                  | Migration schemas use numeric fixed precision and timezone-aware timestamps; automated catalog assertions added                                                                                           |
| Secret handling                   | Server keys remain unprefixed environment variables. Production bundle scan is part of `test:smoke`; run results below after build                                                                        |
| Route-level chunks                | Operational routes and Admin pages are lazy-loaded; smoke script verifies Dashboard, Communications, Settings, Users, and Audit chunks                                                                    |
| E2E business workflow             | Existing tests cover focused business calculations/workflows. Full persisted Product→Customer→Sale→Delivery→Payment→Report and return reconciliation requires staging fixtures and is not claimed locally |

## RLS Table Matrix

The matrix in `VERCEL_DEPLOYMENT.md` enumerates all 36 public tables found in checked-in migrations and their expected role/workflow boundary. `supabase/tests/settings_admin_audit.sql` checks that every public base/partitioned table has RLS, in addition to audit policy, immutability privileges, administration RPC grants, Rider eligibility triggers, and storage types. These are source-level assertions until the migration suite runs against a real PostgreSQL/Supabase instance.

## Environment and Bundle Scan

Public build configuration is limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; service role, SwiftSMS, and future email credentials are server-only. `.env.example` contains a local development callback URL but it is not a build input. The scanner checks production `dist` for `SERVICE_ROLE`, provider keys, role passwords, `localhost:`, loopback URLs, and a known test identity.

Build and scan results: `npm run build` passed. The initial entry JS is 433.76 KB (135.80 KB gzip), below Vite's 500 KB warning threshold. Static bundle smoke found no service-role/SMS key names, role passwords, local URLs, or debug identity. Vite emitted upstream Zod annotation warnings; build completed successfully.

## Smoke Test

`npm run test:smoke` checks homepage HTML, SPA refresh paths, health/readiness JSON, anonymous auth status, unauthenticated settings rejection, bundle secrets, and route chunks. With controlled test credentials it additionally validates login/logout and session cookie flags. Local static smoke against Vite preview passed for the homepage, five deep links, bundle scan, and route chunks. Static-only mode does not exercise serverless APIs. Deployed API/readiness and credentialed cookie smoke remain pending a Vercel Preview URL and optional test identity.

## Local Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run typecheck:api`: passed under NodeNext module resolution.
- `npm test`: 16 files, 45 tests passed.
- `npm run build`: passed; 433.76 KB initial JS, upstream Zod warnings only.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run test:smoke` with `SMOKE_STATIC_ONLY=1` against `http://127.0.0.1:4173`: passed static, bundle, and deep-link checks; API/auth checks were skipped by design.
- Supabase pgTAP, migration execution, direct REST/RPC RLS, and full business-workflow reconciliation: not run; neither `supabase` nor `psql` is installed and no staging credentials are configured.

## Operations

Production/Preview environment separation, backup/restore drills, monitoring, and rollback procedure are documented in `VERCEL_DEPLOYMENT.md`. Before launch: apply all migrations through 025 to staging; run Supabase pgTAP; test Admin/Moderator/Rider/anonymous and cross-org/cross-Rider access directly through PostgREST and APIs; run credentialed smoke; verify backup restore; then record the release commit and migration version.
