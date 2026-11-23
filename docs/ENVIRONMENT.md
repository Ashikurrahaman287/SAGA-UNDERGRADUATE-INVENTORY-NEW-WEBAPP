# Environment

Copy `.env.example` to `.env.local` for local work. Leave values empty when only running the foundation shell; `/api/ready` will correctly report `503` until server configuration is supplied.

| Variable                    | Scope          | Purpose                                                           |
| --------------------------- | -------------- | ----------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Browser/public | Supabase project URL.                                             |
| `VITE_SUPABASE_ANON_KEY`    | Browser/public | Supabase publishable/anon key.                                    |
| `SUPABASE_URL`              | Server/private | Server-side Supabase project URL.                                 |
| `SUPABASE_ANON_KEY`         | Server/private | Server-side Supabase Auth client key.                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Server/private | Server-only provider key. Never expose it to Vite or the browser. |
| `AUTH_REDIRECT_URL`         | Server/private | Approved Supabase recovery callback URL.                          |

Configure Production and Preview values separately in Vercel Project Settings. Use local `.env.local` files outside Git. Do not put passwords, service keys, session secrets, or provider credentials in `VITE_` variables. Add the matching `AUTH_REDIRECT_URL` and `/api/auth/callback` URLs to Supabase Auth URL Configuration. Authentication uses same-origin server endpoints and HttpOnly cookies; browser role state is never stored in localStorage.
