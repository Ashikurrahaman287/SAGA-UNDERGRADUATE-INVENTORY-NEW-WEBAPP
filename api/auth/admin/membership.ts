import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { getSupabaseServerClient } from '../../lib/supabase';
import { recordAuthEvent } from '../../lib/auth/audit';
import { methodNotAllowed, readJson, sendAuthFailure } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { permissions } from '../../../src/lib/permissions/permission-registry';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security';

const schema = z
  .object({
    membershipId: z.string().uuid(),
    role: z.enum(['admin', 'moderator', 'rider']).optional(),
    isActive: z.boolean().optional(),
    revokeSessions: z.boolean().default(false),
  })
  .refine(
    (value) => value.role !== undefined || value.isActive !== undefined || value.revokeSessions,
    'An account action is required.',
  );

export default async function membership(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const input = schema.parse(await readJson(request));
    const context = await requirePermission(request, response, permissions.usersUpdate);
    if (!context) return;
    const admin = getSupabaseServerClient();
    const { data: membership, error: lookupError } = await admin
      .from('memberships')
      .select('id, organization_id, user_id')
      .eq('id', input.membershipId)
      .eq('organization_id', context.organization.id)
      .maybeSingle();
    if (lookupError || !membership) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Membership not found.' } },
        requestId,
      );
      return;
    }
    const changes: { role?: string; is_active?: boolean } = {};
    if (input.role) changes.role = input.role;
    if (input.isActive !== undefined) changes.is_active = input.isActive;
    if (Object.keys(changes).length) {
      const { error } = await admin.from('memberships').update(changes).eq('id', membership.id);
      if (error) throw error;
    }
    if (input.revokeSessions) {
      const { error } = await admin.auth.admin.signOut(membership.user_id, 'global');
      if (error) throw error;
    }
    await recordAuthEvent({
      action:
        input.isActive === false
          ? 'account_deactivated'
          : input.revokeSessions
            ? 'session_revoked'
            : 'membership_updated',
      actorUserId: context.auth.user.id,
      entityId: membership.user_id,
      requestId,
      organizationId: context.organization.id,
    });
    sendJson(response, 200, { updated: true }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
