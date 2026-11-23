# Development

## Installation

Use Node.js 22 or newer and npm. Run `npm install`, copy `.env.example` to `.env.local`, then start Vite with `npm run dev`.

## Quality commands

`npm run typecheck` runs strict TypeScript project checks. `npm run lint` runs ESLint. `npm run test` runs Vitest and React Testing Library. `npm run build` runs the production typecheck and Vite build. `npm run format:check` checks Prettier output. Playwright is configured for future browser tests in `tests/e2e`.

## Conventions

Keep business rules in server/API or shared domain modules, validate external input with Zod, keep API calls same-origin, and preserve the public/private environment boundary. New state-changing endpoints need request IDs, safe error responses, authorization, organization scope, and focused tests. Do not add business tables or seed data without an additive migration and an explicit later-task requirement.

## Database development

Apply `supabase/migrations/*.sql` in filename order in a disposable local or staging Supabase project. Run `supabase db test` for `supabase/tests/database_foundation.sql` when the Supabase CLI and pgTAP are available. The seed file is synthetic development data only and must never be treated as production data. Do not reset a production project or edit migration history to hide a failure.
