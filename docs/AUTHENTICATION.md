# Authentication

## Architecture

SAGA uses Supabase Auth for identity and password management, with a same-origin backend-for-frontend boundary under `api/auth`. The browser never establishes a Supabase session directly and never receives access or refresh tokens. Supabase SSR stores and refreshes the session in HttpOnly cookies through the server-side cookie adapter.

The server verifies the current user with `auth.getUser()`, then reads active `memberships` joined to `organizations`. The selected role is a login context only; authorization comes from the live membership row. If a role spans multiple organizations, login returns `409 ORGANIZATION_SELECTION_REQUIRED` and requires an explicit organization ID from the returned non-sensitive options.

## Endpoints

- `GET /api/auth/csrf` creates a short-lived readable CSRF cookie and returns its value for the in-memory frontend request header.
- `POST /api/auth/login` validates email/password/role, rate-limits the attempt, authenticates with Supabase, verifies active membership, and sets SSR cookies.
- `GET /api/auth/me` server-verifies the session and returns only user display data, selected organization, and verified role.
- `POST /api/auth/logout` performs global Supabase sign-out, clears session/context cookies, and records an audit event.
- `POST /api/auth/forgot-password` sends a Supabase recovery email with the configured redirect URL and returns a generic response.
- `GET /api/auth/callback` exchanges the recovery code for a server session.
- `POST /api/auth/reset-password` changes the password only inside a verified recovery session.
- `POST /api/auth/admin/invite` and `POST /api/auth/admin/membership` are server-only Admin operations for account invitation, role/activation changes, and session revocation.

## Cookies and refresh

Supabase SSR cookies are HttpOnly, `SameSite=Lax`, path `/`, and Secure in production. Session refresh writes are returned in the same response and are preserved alongside the active organization cookie. The browser only stores the CSRF token in React memory; it is not an authorization source and is lost on reload, then re-issued by `/api/auth/csrf`.

Concurrent refresh requests are handled by Supabase SSR's cookie adapter. API clients should retry a single failed request after `/api/auth/me` establishes the refreshed cookie; they must not copy tokens into JavaScript storage. Expired or revoked sessions become unauthenticated and the protected route redirects to `/login`.

## CSRF and origins

All state-changing auth endpoints require the double-submit CSRF token and same-origin `Origin` validation. Production authentication requires HTTPS and Secure cookies. Generic messages prevent account enumeration. Request IDs are retained in API responses and authentication audit records; passwords, tokens, recovery codes, and provider credentials are never logged.

## Rate limiting

Migration `009_auth_rate_limits.sql` creates a private rate-limit table and an atomic `SECURITY DEFINER` PostgreSQL function. Login attempts use a SHA-256 key derived from the forwarded client IP and normalized email, with an 8-attempt/15-minute window. The endpoint returns `429` and `Retry-After` without revealing whether an account exists. This is persistent/shared and does not rely on serverless memory.

## Supabase configuration

Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `AUTH_REDIRECT_URL` only in server runtime settings. The existing `VITE_SUPABASE_*` values remain browser-public for future direct read-only client use, but this authentication flow does not use them. In Supabase Auth URL Configuration, add the production and preview callback URLs, for example `/api/auth/callback`, and the final `/reset-password` URL.

Apply migrations 009 and 010 after the Task 02 migrations. Run them in local/staging first. No public registration is implemented; administrators invite users through the protected server endpoint.

RBAC and resource authorization are documented in [AUTHORIZATION.md](AUTHORIZATION.md). Apply migrations 011 and 012 after the authentication migrations before testing cross-organization or cross-Rider behavior.

## Known limitations

This workspace has no configured Supabase project, Auth identities, or local Supabase CLI/psql, so live login, email delivery, token rotation, PostgreSQL rate-limit execution, and authenticated RLS tests require staging credentials and explicit approval. The frontend and endpoint contracts are tested locally without live credentials.
