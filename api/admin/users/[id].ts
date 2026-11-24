import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendError, sendJson } from '../../lib/response';
import { getSupabaseServerClient } from '../../lib/supabase';
import { requirePermission } from '../../lib/auth/authorization-context';
import { methodNotAllowed, readJson, sendAuthFailure } from '../../lib/auth/http';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security';
import { permissions } from '../../../src/lib/permissions/permission-registry';
import {
  membershipChangeIssue,
  type OperationalRole,
} from '../../../src/features/settings/member-validation';

const schema = z
  .object({
    role: z.enum(['admin', 'moderator', 'rider']).optional(),
    isActive: z.boolean().optional(),
    riderEligible: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.role !== undefined || input.isActive !== undefined || input.riderEligible !== undefined,
    'At least one account field is required.',
  );

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

export default async function updateUser(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'PATCH')) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.usersUpdate);
    if (!context) return;
    const membershipId = z.string().uuid().parse(request.query.id);
    const input = schema.parse(await readJson(request));
    const admin = getSupabaseServerClient();
    const { data: membership, error: lookupError } = await admin
      .from('memberships')
      .select('id, user_id, role, is_active, rider_eligible')
      .eq('organization_id', context.organization.id)
      .eq('id', membershipId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!membership) {
      sendError(response, 404, 'NOT_FOUND', 'User membership not found.', requestId);
      return;
    }
    const targetRole = input.role || membership.role;
    const targetActive = input.isActive ?? membership.is_active;
    let activeAdminCount = 0;
    if (
      membership.role === 'admin' &&
      membership.is_active &&
      (targetRole !== 'admin' || !targetActive)
    ) {
      const { count, error } = await admin
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organization.id)
        .eq('role', 'admin')
        .eq('is_active', true);
      if (error) throw error;
      activeAdminCount = count || 0;
    }
    const issue = membershipChangeIssue({
      actorUserId: context.auth.user.id,
      targetUserId: membership.user_id,
      currentRole: membership.role as OperationalRole,
      currentActive: membership.is_active,
      activeAdminCount,
      role: input.role,
      isActive: input.isActive,
      riderEligible: input.riderEligible,
    });
    if (issue === 'SELF_LOCKOUT') {
      sendError(
        response,
        409,
        issue,
        'You cannot demote or deactivate your own account.',
        requestId,
      );
      return;
    }
    if (issue === 'LAST_ADMIN') {
      sendError(response, 409, issue, 'The organization must retain one active Admin.', requestId);
      return;
    }
    if (issue === 'INVALID_RIDER_ELIGIBILITY') {
      sendError(
        response,
        400,
        issue,
        'Only active Rider accounts can be delivery-eligible.',
        requestId,
      );
      return;
    }

    const { data, error } = await admin.rpc('admin_update_membership', {
      p_organization_id: context.organization.id,
      p_actor_user_id: context.auth.user.id,
      p_membership_id: membershipId,
      p_role: input.role || null,
      p_is_active: input.isActive ?? null,
      p_rider_eligible: input.riderEligible ?? null,
      p_request_id: requestId,
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('last active admin') || message.includes('retain one active admin')) {
        sendError(
          response,
          409,
          'LAST_ADMIN',
          'The organization must retain one active Admin.',
          requestId,
        );
        return;
      }
      if (message.includes('cannot demote') || message.includes('cannot deactivate their own')) {
        sendError(
          response,
          409,
          'SELF_LOCKOUT',
          'You cannot demote or deactivate your own account.',
          requestId,
        );
        return;
      }
      if (message.includes('membership not found')) {
        sendError(response, 404, 'NOT_FOUND', 'User membership not found.', requestId);
        return;
      }
      throw error;
    }

    const changedAccess =
      (input.role !== undefined && input.role !== membership.role) ||
      (input.isActive !== undefined && input.isActive !== membership.is_active);
    if (changedAccess) {
      const { error: revokeError } = await admin.auth.admin.signOut(membership.user_id, 'global');
      if (revokeError) throw revokeError;
    }
    sendJson(response, 200, { data, sessionsRevoked: changedAccess, requestId }, requestId);
  } catch (error) {
    if (messageOf(error).toLowerCase().includes('rider')) {
      sendError(
        response,
        400,
        'INVALID_MEMBERSHIP',
        'Rider eligibility requires an active Rider role.',
        requestId,
      );
      return;
    }
    sendAuthFailure(response, request, error);
  }
}
