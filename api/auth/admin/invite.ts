import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { getServerEnv } from '../../lib/env.js';
import { getSupabaseServerClient } from '../../lib/supabase.js';
import { methodNotAllowed, readJson, sendAuthFailure } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { memberInviteSchema } from '../../../src/features/settings/member-validation.js';

export default async function invite(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const input = memberInviteSchema.parse(await readJson(request));
    const context = await requirePermission(request, response, permissions.usersCreate);
    if (!context) return;
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
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw profileError;
    }
    const { error: membershipError } = await admin.rpc('admin_create_membership', {
      p_organization_id: context.organization.id,
      p_actor_user_id: context.auth.user.id,
      p_user_id: data.user.id,
      p_role: input.role,
      p_request_id: requestId,
    });
    if (membershipError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw membershipError;
    }
    sendJson(response, 201, { invited: true }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
