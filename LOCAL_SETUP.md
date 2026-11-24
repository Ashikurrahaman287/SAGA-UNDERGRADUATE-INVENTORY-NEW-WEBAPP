# Local Setup Guide

This guide runs SAGA Inventory on your Windows PC with Supabase storing the database and authentication data.

The setup has two local processes:

- Vite serves the frontend at `http://localhost:5173`.
- Vercel CLI serves the existing `api/**/*.ts` serverless handlers at `http://localhost:3000`.
- Vite proxies `/api/*` to Vercel CLI, preserving same-origin cookies and CSRF behavior.

Supabase can be used either locally in Docker or in Supabase Cloud.

## 1. Requirements

Install:

- Node.js 22 or newer
- npm
- Docker Desktop for local Supabase
- Supabase CLI
- Vercel CLI
- Git

Verify:

```powershell
node --version
npm --version
docker --version
npx supabase --version
npx vercel --version
```

GitHub-cloned users can also install Vercel CLI globally:

```powershell
npm install -g vercel
npm install -g supabase
```

This guide does not require a paid Vercel account for local development.

## 2. Install the project

Open PowerShell in the repository root:

```powershell
cd E:\SAGA-NEW\SAGA-UNDERGRADUATE-INVENTORY-NEW-WEBAPP
npm install
Copy-Item .env.example .env.local
```

Never commit `.env.local` or any private key.

## 3. Choose Supabase mode

### Option A: Supabase Cloud

Use this option if you want stable data and do not want Docker running.

1. Open the Supabase project dashboard.
2. Open Project Settings, then API.
3. Copy:
   - Project URL
   - Publishable/anon key
   - Service-role key
4. Add these values to `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
AUTH_REDIRECT_URL=http://localhost:5173/reset-password

SWIFTSMS_API_KEY=
SWIFTSMS_BASE_URL=https://swiftsms.astgd.com
EMAIL_PROVIDER=none
EMAIL_API_KEY=
EMAIL_FROM_ADDRESS=
```

Do not add `SUPABASE_SERVICE_ROLE_KEY`, SMS keys, email keys, or passwords to `VITE_*` variables.

Link and migrate the project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Do not run destructive reset commands against the cloud database.

### Option B: Fully local Supabase

Use this option if Docker is available and you want all application data stored on the PC.

Start Docker Desktop, then:

```powershell
npx supabase start
npx supabase db reset
```

`db reset` is destructive only inside the local Supabase environment. Do not run it against a linked cloud project.

The CLI prints local API, Studio, database, anon, and service-role values.

A typical `.env.local` looks like:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=LOCAL_ANON_KEY

SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=LOCAL_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=LOCAL_SERVICE_ROLE_KEY
AUTH_REDIRECT_URL=http://localhost:5173/reset-password

SWIFTSMS_API_KEY=
SWIFTSMS_BASE_URL=https://swiftsms.astgd.com
EMAIL_PROVIDER=none
EMAIL_API_KEY=
EMAIL_FROM_ADDRESS=
```

Open Supabase Studio:

```text
http://127.0.0.1:54323
```

The migration files under `supabase/migrations/` are reapplied in filename order by `supabase db reset`.

## 4. Create a local identity

The app does not use public registration. Create users through Supabase Studio or the protected invitation API.

For Studio-created users:

1. Open Authentication, then Users.
2. Create an Auth identity.
3. Open Table Editor, then `profiles`.
4. Insert or update the matching profile with the Auth user ID and display name.
5. Open `organizations` and create or select an organization.
6. Open `memberships` and insert:
   - `organization_id`: organization UUID
   - `user_id`: Auth user UUID
   - `role`: `admin`, `moderator`, or `rider`
   - `is_active`: `true`
7. Rider membership users must also set `rider_eligible = true` if migration 025 has been applied.

For a cloud project, use Supabase Auth and SQL/Studio only for local trusted setup. Do not share the service-role key or execute privileged SQL from a browser.

## 5. Configure Supabase Auth URLs

In Supabase Auth URL Configuration:

- Add `http://localhost:5173/**` as an allowed redirect URL if supported by the project configuration.
- Set `AUTH_REDIRECT_URL=http://localhost:5173/reset-password` in `.env.local`.
- Add `http://localhost:5173/reset-password` to password recovery redirects.

For local Supabase, the callback/redirect URLs generally use `localhost` or `127.0.0.1` consistently. Do not mix those hosts when testing cookies.

## 6. Start the backend locally

Open Terminal 1 in the repository root:

```powershell
npm run dev:api
```

Use Vercel CLI for local serverless API development. It can run the existing `api/**/*.ts` handlers without deploying or charging for a Vercel deployment.

If Vercel CLI asks to link the repository, use a local or existing project according to your own account access. Local API development does not require an active production deployment.

Keep the `.env.local` values available to the Vercel process. Never print private key values in terminal logs.

## 7. Start the frontend locally

Open Terminal 2:

```powershell
npm run dev
```

Open:

```text
http://localhost:5173
```

The Vite proxy forwards:

```text
http://localhost:5173/api/*
         ->
http://localhost:3000/api/*
```

This preserves same-origin `/api` URLs and allows HttpOnly cookie/auth behavior.

## 8. Optional seed data

The repository contains synthetic seed SQL. Review it before loading it:

```powershell
npx supabase db reset
```

For a cloud project, run seed data only against a disposable development/staging database. Never use development seed data against production.

## 9. Verify the setup

Check the frontend:

```text
http://localhost:5173
```

Check the API through the frontend origin:

```text
http://localhost:5173/api/health
http://localhost:5173/api/ready
http://localhost:5173/api/auth/me
```

Expected results:

- `/api/health`: HTTP 200
- `/api/ready`: HTTP 200 if all server variables are loaded and Supabase is reachable
- `/api/auth/me`: HTTP 200 with `{"authenticated":false}` when signed out

Sign in using an Auth identity and an active membership. The selected organization and role come from trusted Supabase membership data.

## 10. Quality checks

Run from the repository root:

```powershell
npm run lint
npm run typecheck
npm run typecheck:api
npm test
npm run build
npm audit --omit=dev
```

For database tests, first start or link Supabase:

```powershell
npx supabase db test
```

Live RLS tests require Auth identities and a disposable database; do not claim they pass until migrations and role fixtures run successfully.

## 11. Daily workflow

Terminal 1:

```powershell
npm run dev:api
```

Terminal 2:

```powershell
npm run dev
```

For local Supabase:

```powershell
docker start
npx supabase start
```

Docker Desktop must be running before `npx supabase start`.

## 12. Stop services

Stop Vite with `Ctrl+C`.

Stop Vercel dev with `Ctrl+C`.

Stop local Supabase:

```powershell
npx supabase stop
```

Stop Docker Desktop if it is no longer needed.

## 13. Troubleshooting

### Vite can open but `/api` returns 404 or connection refused

Confirm Vercel CLI is running on port 3000:

```text
http://localhost:3000/api/health
```

Then confirm `vite.config.ts` proxies `/api` to port 3000.

### Login does not retain the session

Use the same origin and host consistently:

```text
http://localhost:5173
```

Do not switch between `localhost` and `127.0.0.1` during login or password reset.

### `/api/ready` is unavailable

Check `.env.local` for:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_REDIRECT_URL`

Restart Vercel CLI after environment changes.

### A user cannot sign in

Verify:

- The Auth user exists.
- `profiles.id` matches the Auth user ID.
- `memberships.user_id` matches the Auth user ID.
- `memberships.is_active` is `true`.
- The selected role matches an active membership role.
- The organization cookie can select the intended organization.

### Supabase migration fails

Do not reset a linked cloud project. Inspect the migration in order under `supabase/migrations/`, then apply it to a fresh local/staging database. Never drop or reset a cloud production database to repair a migration.

### Private key was exposed

Immediately rotate it in Supabase. Remove it from browser variables, source code, logs, screenshots, chat, and build environments. Use only server environment variables or Supabase secrets for replacements.

## 14. Security notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` off the browser and out of `VITE_*` variables.
- Keep SMS/email/API credentials off the browser.
- Keep data in Supabase; do not use browser LocalStorage for business or session data.
- `npm run dev` alone is not enough for authenticated workflows; run Vercel CLI or another local API runtime.
- This setup has no public URL unless you intentionally expose or deploy it later.
