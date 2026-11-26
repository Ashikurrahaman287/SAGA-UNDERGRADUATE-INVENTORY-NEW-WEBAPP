# Deployment

## Vercel

Create a Vercel project rooted at the repository root. Use the Vite framework preset, `npm run build` as the build command, and `dist` as the output directory. The checked-in `vercel.json` applies security headers and the SPA fallback while excluding API paths.

Add the server environment variables from [ENVIRONMENT.md](ENVIRONMENT.md) to the correct Preview or Production scope. Deploy a preview first. Verify the homepage, direct client-route refresh, `/api/health` (HTTP 200 JSON), and `/api/ready` (HTTP 200 only when server configuration and database connectivity both succeed; otherwise safe HTTP 503). The full release runbook is in [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).

## Supabase

Create or select the project outside this repository, then obtain the project URL and appropriate public/server keys through the Supabase dashboard. Apply the numbered migrations in `supabase/migrations/` to a staging project, verify RLS and the business workflows, then promote reviewed migrations to Production. Never run a destructive reset against a linked cloud project. Use the database test scripts under `supabase/tests/` where the local Supabase test stack and pgTAP are available.

## Rollback

Use Vercel's deployment history to promote the previous verified deployment. Keep Preview and Production variables separate, investigate `/api/health` and logs using request IDs, and do not reset a Supabase project or run destructive schema commands as a rollback strategy.
