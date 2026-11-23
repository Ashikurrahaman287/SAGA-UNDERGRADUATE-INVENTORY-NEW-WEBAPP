import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stringifySetCookie } from 'cookie';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { recordAuthEvent } from '../lib/auth/audit';
import { readJson, methodNotAllowed, sendAuthFailure, jsonSuccess } from '../lib/auth/http';
import { createAuthClient, clearAuthCookies } from '../lib/auth/session';
import { consumeLoginLimit, requireCsrf, requireSameOrigin } from '../lib/auth/security';

const inputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1),
  role: z.enum(['admin', 'moderator', 'rider']),
  organizationId: z.string().uuid().optional(),
});
const genericFailure = 'Invalid account identity, password, or role.';

export default async function login(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const input = inputSchema.parse(await readJson(request));
    const limit = await consumeLoginLimit(request, input.email);
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfter));
      sendJson(
        response,
        429,
        {
          error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
          requestId,
        },
        requestId,
      );
      return;
    }
    const auth = createAuthClient(request, response);
    const { data, error } = await auth.client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.user) {
      await recordAuthEvent({ action: 'login_failed', requestId });
      sendJson(
        response,
        401,
        { error: { code: 'AUTHENTICATION_FAILED', message: genericFailure }, requestId },
        requestId,
      );
      return;
    }
    const { data: memberships, error: membershipError } = await auth.client
      .from('memberships')
      .select('organization_id, role, organizations(id, name)')
      .eq('user_id', data.user.id)
      .eq('is_active', true)
      .eq('role', input.role);
    if (membershipError) throw membershipError;
    const options = (memberships || []).flatMap((row) => {
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      return org ? [{ id: row.organization_id, name: org.name, role: row.role }] : [];
    });
    if (
      !options.length ||
      (input.organizationId && !options.some((org) => org.id === input.organizationId))
    ) {
      await auth.client.auth.signOut({ scope: 'local' });
      clearAuthCookies(request, response);
      await recordAuthEvent({
        action: 'login_membership_denied',
        entityId: data.user.id,
        requestId,
        metadata: { requestedRole: input.role },
      });
      sendJson(
        response,
        401,
        { error: { code: 'AUTHENTICATION_FAILED', message: genericFailure }, requestId },
        requestId,
      );
      return;
    }
    if (!input.organizationId && options.length > 1) {
      await auth.client.auth.signOut({ scope: 'local' });
      clearAuthCookies(request, response);
      sendJson(
        response,
        409,
        {
          error: {
            code: 'ORGANIZATION_SELECTION_REQUIRED',
            message: 'Select an organization to continue.',
          },
          organizations: options,
          requestId,
        },
        requestId,
      );
      return;
    }
    const organization = options.find((org) => org.id === (input.organizationId || options[0].id))!;
    auth.commit();
    const refreshedCookies = response.getHeader('Set-Cookie');
    const cookieHeaders = Array.isArray(refreshedCookies)
      ? refreshedCookies.map(String)
      : refreshedCookies
        ? [String(refreshedCookies)]
        : [];
    response.setHeader('Set-Cookie', [
      ...cookieHeaders,
      stringifySetCookie({
        name: 'saga_org_id',
        value: organization.id,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 8,
      }),
    ]);
    await recordAuthEvent({
      action: 'login_success',
      actorUserId: data.user.id,
      entityId: data.user.id,
      requestId,
      metadata: { organizationId: organization.id, role: organization.role },
    });
    jsonSuccess(response, request, 200, {
      authenticated: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || data.user.email,
      },
      organization: { id: organization.id, name: organization.name },
      role: organization.role,
      requestId,
    });
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
