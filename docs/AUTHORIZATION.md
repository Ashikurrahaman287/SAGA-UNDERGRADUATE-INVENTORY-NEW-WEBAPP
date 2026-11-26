# Authorization

## Architecture

Authorization is evaluated at four boundaries: React route and presentation guards, server middleware, server resource lookups, and Supabase RLS. The browser role is derived from the verified `/api/auth/me` response only for presentation. The server derives user, organization, and role from the Supabase session and active `memberships` row; request payloads cannot select a different tenant or Rider.

The shared permission vocabulary is in `src/lib/permissions/permission-registry.ts`. `api/lib/auth/authorization-context.ts` is the backend enforcement boundary and records denied permission checks. Business endpoints use `requirePermission` and must retain that server-side authorization boundary.

## Permission matrix

| Area                                | Admin                         | Moderator                       | Rider                                                              |
| ----------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Workspace                           | View                          | View                            | View                                                               |
| Dashboard/analytics                 | Full                          | Denied                          | Denied                                                             |
| Products/inventory                  | Full                          | View/create/update/stock adjust | Denied                                                             |
| Customers                           | Full                          | View/create/update              | Denied except minimal assigned-delivery data |
| Sales/history                       | Full                          | View/create/update              | Denied                                                             |
| Packaging                           | Full                          | View/update                     | Denied                                                             |
| Delivery                            | Full/assign/reassign/complete | View/update/complete            | Assigned view/update/complete only                                 |
| Payments                            | Full                          | Not enabled by default          | Collection only in assigned workflow                               |
| Suppliers/sellers                   | Full                          | Denied                          | Denied                                                             |
| Reports/accounting/costs            | Full                          | Denied                          | Denied                                                             |
| Returns/refunds                     | Full                          | Denied by default               | Denied                                                             |
| Communications/settings/users/audit | Full                          | Denied                          | Denied                                                             |
| Optional CRM/investments            | Full when enabled             | Denied                          | Denied                                                             |

The authenticated UI exposes role-appropriate operational modules. Navigation filtering is a usability boundary, not a security control.

## Backend flow

1. `getAuthContext` calls Supabase `auth.getUser()` through the SSR cookie client.
2. Active memberships are loaded from the database, and the HttpOnly organization context is matched against those memberships.
3. `requireAuthorization` resolves the trusted organization and role and checks the centralized permission registry.
4. Resource helpers add tenant and ownership predicates. Rider delivery access requires `rider_user_id = auth.uid()` and returns no row for another Rider.
5. Denials use 401 for missing identity, 403 for a verified but disallowed operation, and 404 for intentionally hidden resources.
6. Denials and privileged changes are written to `audit_logs` with actor, organization, action, entity, and request ID where available.

## RLS and database hardening

The numbered migrations enable RLS on application tables. Migration 011 prevents tenant reparenting, prevents membership user/organization reassignment, limits Rider delivery field mutation, and removes normal membership deletion. Migration 012 restricts delivery event inserts to the assigned Rider and preserves append-only history boundaries. RLS policies remain an independent boundary even when an API handler is bypassed.

`SECURITY DEFINER` helpers use fixed search paths and are not executable by `PUBLIC`. Anonymous users have no business-table policies. The service-role client is server-only and is used only for explicitly privileged account operations/audit writes.

## Frontend guards

`ProtectedRoute` handles authentication and optional permission checks. `PermissionGuard` and `RoleGuard` are reusable presentation guards. `getAuthorizedNavigation` filters destinations by the centralized permission registry. These utilities improve UX but are never treated as authorization; every mutation must call backend middleware and rely on RLS.

## Rider boundary

Rider queries use the authenticated user ID from the session, never `rider_user_id` from the request body. `requireDeliveryAccess` filters by trusted organization and authenticated Rider assignment. The database policy and trigger prevent cross-Rider event writes, assignment changes, tenant changes, and invalid delivery transitions. Rider delivery responses are allowlisted and omit customer email and administrative payment data.

## Testing

Automated tests cover permission rules and frontend navigation. Direct Supabase REST/RPC RLS tests, cross-organization tests, and cross-Rider tests require isolated Auth identities and a staging Supabase project; local unit tests alone do not verify those boundaries.
