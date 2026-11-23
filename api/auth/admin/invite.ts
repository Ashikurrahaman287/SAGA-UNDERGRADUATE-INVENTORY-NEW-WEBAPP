import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { getServerEnv } from '../../lib/env';
import { getSupabaseServerClient } from '../../lib/supabase';
import { recordAuthEvent } from '../../lib/auth/audit';
import { methodNotAllowed, readJson, sendAuthFailure } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { permissions } from '../../../src/lib/permissions/permission-registry';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security';

const schema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(1).max(200),
  organizationId: z.string().uuid(),
  role: z.enum(['admin', 'moderator', 'rider']),
});

export default async function invite(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const input = schema.parse(await readJson(request));
    const context = await requirePermission(request, response, permissions.usersCreate);
    if (!context || context.organization.id !== input.organizationId) {
      if (context)
        sendJson(
          response,
          403,
          { error: { code: 'FORBIDDEN', message: 'Administrator access is required.' } },
          requestId,
        );
      return;
    }
    const env = getServerEnv();
    if (!env.AUTH_REDIRECT_URL) throw new Error('Authentication configuration is unavailable.');
    const admin = getSupabaseServerClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: { full_name: input.fullName },
      redirectTo: env.AUTH_REDIRECT_URL,
    });
    if (error || !data.user) throw error || new Error('Invite failed.');
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ id: data.user.id, full_name: input.fullName });
    if (profileError) throw profileError;
    const { error: membershipError } = await admin
      .from('memberships')
      .insert({ organization_id: input.organizationId, user_id: data.user.id, role: input.role });
    if (membershipError) throw membershipError;
    await recordAuthEvent({
      action: 'account_invited',
      actorUserId: context.auth.user.id,
      entityId: data.user.id,
      requestId,
      organizationId: input.organizationId,
      metadata: { role: input.role },
    });
    sendJson(response, 201, { invited: true }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
