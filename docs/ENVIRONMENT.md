# Environment

Copy `.env.example` to `.env` for local work. The local API runner reads `.env`; Vite reads public `VITE_*` values for the browser build. A configured Supabase project is required for database-backed workflows. Optional communication providers require their server-only settings.

| Variable                    | Scope          | Purpose                                                           |
| --------------------------- | -------------- | ----------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Browser/public | Supabase project URL.                                             |
| `VITE_SUPABASE_ANON_KEY`    | Browser/public | Supabase publishable/anon key.                                    |
| `SUPABASE_URL`              | Server/private | Server-side Supabase project URL.                                 |
| `SUPABASE_ANON_KEY`         | Server/private | Server-side Supabase Auth client key.                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Server/private | Server-only provider key. Never expose it to Vite or the browser. |
| `AUTH_REDIRECT_URL`         | Server/private | Approved Supabase recovery callback URL.                          |
| `SWIFTSMS_API_KEY`          | Server/private | Optional SMS provider credential.                                  |
| `SWIFTSMS_BASE_URL`         | Server/private | SMS provider endpoint.                                             |
| `EMAIL_PROVIDER`            | Server/private | `none`, `smtp`, `resend`, `postmark`, or `sendgrid`.               |
| `EMAIL_SMTP_HOST`           | Server/private | SMTP hostname when `EMAIL_PROVIDER=smtp`.                          |
| `EMAIL_SMTP_PORT`           | Server/private | SMTP port, commonly `465` or `587`.                                |
| `EMAIL_SMTP_USER`            | Server/private | SMTP username.                                                     |
| `EMAIL_SMTP_PASSWORD`       | Server/private | SMTP password.                                                     |
| `EMAIL_FROM_NAME`           | Server/private | Sender name displayed in recipient inboxes.                        |
| `EMAIL_FROM_ADDRESS`        | Server/private | Verified sender address.                                           |

Configure Production and Preview values separately in Vercel Project Settings. `.env` is ignored by Git. Never put passwords, service keys, SMTP/SMS credentials, or other provider credentials in `VITE_` variables. Add the deployed Auth callback and recovery URLs to Supabase Auth URL Configuration. Authentication uses same-origin server endpoints and HttpOnly cookies; browser role state is never stored in localStorage. Supabase Auth SMTP settings do not automatically configure transactional emails sent by this application; configure the same SMTP credentials in the server environment when using the app SMTP transport.
