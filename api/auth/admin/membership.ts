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
      .select('id, organization_id, user_id, role, is_active')
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
    const accessChanged =
      (input.role !== undefined && input.role !== membership.role) ||
      (input.isActive !== undefined && input.isActive !== membership.is_active);
    if (accessChanged) {
      const { error } = await admin.rpc('admin_update_membership', {
        p_organization_id: context.organization.id,
        p_actor_user_id: context.auth.user.id,
        p_membership_id: membership.id,
        p_role: input.role || null,
        p_is_active: input.isActive ?? null,
        p_rider_eligible: null,
        p_request_id: requestId,
      });
      if (error) throw error;
    }
    if (input.revokeSessions || accessChanged) {
      const { error } = await admin.auth.admin.signOut(membership.user_id, 'global');
      if (error) throw error;
    }
    if (input.revokeSessions && !accessChanged)
      await recordAuthEvent({
        action: 'session_revoked',
        actorUserId: context.auth.user.id,
        entityId: membership.user_id,
        requestId,
        organizationId: context.organization.id,
      });
    sendJson(
      response,
      200,
      { updated: true, sessionsRevoked: input.revokeSessions || accessChanged },
      requestId,
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
