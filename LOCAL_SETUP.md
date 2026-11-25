# SAGA Inventory - Local Setup Guide

This guide runs the complete SAGA Inventory application on Windows using Supabase for database and authentication.

## Local architecture

The project uses two local processes:

- Frontend: Vite at `http://localhost:5173`
- API: direct TypeScript runner at `http://127.0.0.1:3000`

Vite proxies `/api/*` to port `3000`. Vercel CLI is not required for local development.

## 1. Requirements

Install:

- Node.js 22 or newer
- npm
- Supabase CLI
- Git
- Docker Desktop only if using local Supabase

Verify the tools:

```powershell
node --version
npm --version
npx supabase --version
```

## 2. Open the project

```powershell
cd E:\SAGA-LOCAL-RUN\SAGA-UNDERGRADUATE-INVENTORY-NEW-WEBAPP
npm install
```

Environment variables are loaded from `.env`. A template is available in `.env.example`:

```powershell
Copy-Item .env.example .env
```

Never commit `.env`. It is ignored by Git.

## 3. Configure Supabase

Open the Supabase project dashboard and collect:

- Project URL
- Publishable/anon key
- Service-role key
- Project reference ID

Add them to `.env`:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
AUTH_REDIRECT_URL=http://localhost:5173/reset-password

SWIFTSMS_API_KEY=
SWIFTSMS_BASE_URL=https://swiftsms.astgd.com
EMAIL_PROVIDER=none
EMAIL_API_KEY=
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
EMAIL_FROM_ADDRESS=

ADMIN_PASSWORD=
MOD_PASSWORD=
RIDER_PASSWORD=
```

Never place `SUPABASE_SERVICE_ROLE_KEY`, SwiftSMS credentials, email credentials, or role passwords in a `VITE_*` variable.
For application email through SMTP, set `EMAIL_PROVIDER=smtp` and provide the SMTP host, port, user, password, and sender address as server-only variables. Supabase Auth's SMTP settings do not automatically configure application reminder email.

### Link Supabase Cloud

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list --remote
npx supabase db push --remote --yes
```

Do not run a destructive database reset against a linked cloud project.

## 4. Create organization identities

The app uses Supabase Auth identities and database memberships. Public registration is not enabled.

### Create an Auth user

In Supabase Dashboard:

1. Open Authentication > Users.
2. Add the user.
3. Confirm the email or enable confirmed status.
4. Copy the generated Auth user UUID.

Set the password separately in Supabase Auth. Keep `ADMIN_PASSWORD` synchronized only if that value is intentionally used for the admin account.

### Create the organization

In Table Editor, open `organizations` and add:

- `name`: SAGA Inventory
- `slug`: saga-inventory
- `currency`: BDT
- `timezone`: Asia/Dhaka
- `is_active`: true

Leave `id`, `created_at`, and `updated_at` at their defaults.

### Create profile and membership

In `profiles`, create a row with:

- `id`: Auth user UUID
- `full_name`: the person's name

In `memberships`, create:

- `organization_id`: organization UUID
- `user_id`: Auth user UUID
- `role`: `admin`, `moderator`, or `rider`
- `is_active`: true
- `rider_eligible`: true only for an active rider

## 5. Configure Auth redirects

In Supabase Authentication URL configuration, add:

- `http://localhost:5173/**`
- `http://localhost:5173/reset-password`

Keep `.env` set to:

```dotenv
AUTH_REDIRECT_URL=http://localhost:5173/reset-password
```

Use `localhost`, not mixed `localhost` and `127.0.0.1`, while testing browser cookies.

## 6. Configure SwiftSMS

Set SwiftSMS values in `.env`:

```dotenv
SWIFTSMS_API_KEY=YOUR_SWIFTSMS_API_KEY
SWIFTSMS_BASE_URL=https://swiftsms.astgd.com
```

SMS is sent automatically when:

- A new sale is created for a customer with a valid Bangladesh phone number
- A delivery is marked delivered
- A delivery payment is collected

Use the Communications page to check balance and send manual SMS.

## 7. Start the application

Open Terminal 1:

```powershell
npm run dev:api
```

Expected output:

```text
Local API listening at http://127.0.0.1:3000
```

Open Terminal 2:

```powershell
npm run dev
```

Open:

```text
http://localhost:5173
```

The Vite proxy sends `/api/*` requests from the browser to port `3000`.

## 8. Verify health

```text
http://localhost:5173/api/health
http://localhost:5173/api/ready
http://localhost:5173/api/auth/me
```

Expected:

- `/health`: 200 and status `ok`
- `/ready`: 200 only when configuration and database are available
- `/auth/me`: `{"authenticated":false}` before sign-in

## 9. Sign in

Open:

```text
http://localhost:5173/login
```

Enter:

- Auth email
- Auth password
- Role matching the `memberships.role` value

An organization is selected automatically when the account has one active membership.

## 10. Optional legacy data import

If legacy JSON exports are present in `C:\Users\ASH\Downloads`, import them:

```powershell
npm run import:legacy
npm run backfill:sales
```

The importer preserves source IDs where possible and is intended to run once or repeatedly with matching organization IDs. Review data before using this against production.

## 11. Quality checks

```powershell
npm run typecheck
npm run typecheck:api
npm test
npm run build
npm audit --omit=dev
```

Database verification:

```powershell
npx supabase migration list --remote
npx supabase db push --remote --yes
```

## 12. Troubleshooting

### Port 3000 is already in use

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000
```

Stop the process by PID, then restart:

```powershell
Stop-Process -Id <PID> -Force
npm run dev:api
```

### Invalid account identity, password, or role

Check:

- Email is confirmed in Supabase Auth
- Password matches the Auth account
- `role` matches an active `memberships.role`
- `rider_eligible = true` for rider accounts
- Organization exists and is active

### Invalid request origin

Use the same host consistently:

```text
http://localhost:5173
```

Do not mix `localhost` and `127.0.0.1` in the browser and Auth URLs.

### Database permission denied

Push all migrations:

```powershell
npx supabase db push --remote --yes
```

Then verify migration 026 or later is listed by:

```powershell
npx supabase migration list --remote
```

### SwiftSMS shows invalid balance or credentials

Verify:

- `SWIFTSMS_API_KEY` is set
- `SWIFTSMS_BASE_URL=https://swiftsms.astgd.com`
- The API server was restarted after editing `.env`

Use the Communications page to verify the live balance; it does not send a real SMS.

## 13. Stop the application

Press `Ctrl+C` in both PowerShell terminals.

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
