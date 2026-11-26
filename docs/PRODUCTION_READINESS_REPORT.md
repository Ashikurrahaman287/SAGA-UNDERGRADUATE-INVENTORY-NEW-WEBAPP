# Production Readiness Report

## Summary

Status as of 2026-11-26: local build and automated checks pass, and migrations `001`–`049` are applied to the currently linked Supabase project. This report is not a production-readiness certification. A deployed Preview smoke run, separate staging RLS/tenant tests, credentialed role checks, backup/restore drill, and real recipient email/SMS delivery have not been verified here.

## Audit Results

| Area                              | Finding / status                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel routing                    | Vite output is `dist`; checked-in rewrite excludes `/api/`; deep-route refresh and function routing require deployed smoke verification                                                                   |
| Health                            | `/api/health` is process liveness and returns non-sensitive JSON                                                                                                                                          |
| Readiness                         | `/api/ready` now checks configuration plus a Supabase query, returns generic 503 on failure, and exposes no connection string                                                                             |
| Sessions                          | Supabase Auth SSR cookies are HttpOnly/SameSite=Lax and Secure in production; active membership is reloaded per request; access changes request global sign-out                                           |
| CSRF                              | Double-submit token and same-origin checks protect state-changing auth and admin endpoints                                                                                                                |
| Login rate limits                 | Persistent PostgreSQL RPC; now fail closed when the database limiter errors                                                                                                                               |
| Public-table RLS                  | Checked-in migrations enable RLS across application tables; see the expected access matrix in `VERCEL_DEPLOYMENT.md`. Separate staging role/cross-tenant execution remains outstanding          |
| Audit/communications immutability | Audit has update/delete revokes plus an immutability trigger; communication log immutability is defined in migration 023. Verify effective grants/RLS in staging                                          |
| Tenant/Rider boundaries           | APIs derive organization and Rider identity from verified membership/session. Rider has no direct customer/sale table access and receives an allowlisted assigned-delivery response                       |
| Money/timestamps                  | Migration schemas use numeric fixed precision and timezone-aware timestamps; automated catalog assertions added                                                                                           |
| Secret handling                   | Server keys remain unprefixed environment variables; `.env` is ignored and absent from current Git history. Re-run bundle scan for every release                                      |
| Route-level chunks                | Operational routes and Admin pages are lazy-loaded; smoke script verifies Dashboard, Communications, Settings, Users, and Audit chunks                                                                    |
| E2E business workflow             | Tests cover focused business calculations/workflows. Full persisted Product→Customer→Sale→Delivery→Payment→Report and return reconciliation still requires staging fixtures                 |

## RLS Table Matrix

The matrix in `VERCEL_DEPLOYMENT.md` documents the expected role/workflow boundary. `supabase/tests/settings_admin_audit.sql` checks public tables for RLS, audit policy, immutability privileges, administration RPC grants, Rider eligibility triggers, and storage types. These are source-level assertions until the migration suite runs against an isolated staging database.

## Environment and Bundle Scan

Public build configuration is limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; service role, SwiftSMS, SMTP, and email API credentials are server-only. `.env.example` contains placeholders only and is not a build input. The scanner checks production `dist` for `SERVICE_ROLE`, provider keys, role passwords, `localhost:`, loopback URLs, and a known test identity.

Build and scan results must be refreshed for each release. The latest local production build passed; Vite emitted upstream Zod annotation warnings only. Run the smoke script against the release build and review its bundle scan before deployment.

## Smoke Test

`npm run test:smoke` checks homepage HTML, SPA refresh paths, health/readiness JSON, anonymous auth status, unauthenticated settings rejection, bundle secrets, and route chunks. With controlled test credentials it additionally validates login/logout and session cookie flags. Static-only mode does not exercise serverless APIs. A deployed Preview smoke and credentialed cookie smoke remain required before production promotion.

## Local Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run typecheck:api`: passed under NodeNext module resolution.
- `npm test`: 20 files and 62 tests passed.
- `npm run build`: passed; 434.40 KB initial JavaScript bundle, with upstream Zod annotation warnings only.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run test:smoke` against the local Vite/API stack with readiness required: homepage, deep links, bundle scan, API health/readiness, anonymous auth, and protected settings checks passed. Credentialed login/logout checks were skipped because no smoke-test identity was configured.
- Supabase migrations `001`–`049`: applied to the currently linked project; this is not a separate staging migration test.
- Deployed Preview smoke, credentialed role/cookie checks, staging RLS and cross-tenant tests, backup restore, and a real recipient email/SMS test: not verified in this review.

## Operations

Production/Preview environment separation, backup/restore drills, monitoring, and rollback procedure are documented in `VERCEL_DEPLOYMENT.md`. Before launch: apply migrations `001`–`049` to an isolated staging project; run available database tests; test Admin/Moderator/Rider/anonymous and cross-organization access through PostgREST and APIs; run credentialed Preview smoke; verify backup restore; then record the release commit and migration version.
