# Deployment

## Vercel

Create a Vercel project rooted at the repository root. Use the Vite framework preset, `npm run build` as the build command, and `dist` as the output directory. The checked-in `vercel.json` applies security headers and the SPA fallback while excluding API paths.

Add the four environment variables from [ENVIRONMENT.md](ENVIRONMENT.md) to the correct Preview or Production scope. Deploy a preview first. Verify the homepage, direct client-route refresh, `/api/health` (HTTP 200 JSON), and `/api/ready` (expected 200 or 503 based on configured server variables).

## Supabase

Create or select the project outside this repository, then obtain the project URL and appropriate public/server keys through the Supabase dashboard. No schema, auth policy, storage bucket, or production data is created by Task 01. Later migrations must be additive, reviewed, and tested against staging with RLS enabled before production.

## Rollback

Use Vercel's deployment history to promote the previous verified deployment. Keep Preview and Production variables separate, investigate `/api/health` and logs using request IDs, and do not reset a Supabase project or run destructive schema commands as a rollback strategy.
