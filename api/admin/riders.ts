import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';

export default async function activeRiders(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.deliveryAssign);
    if (!context) return;
    const memberships = await context.client
      .from('memberships')
      .select('user_id, rider_eligible, profiles(id, full_name)')
      .eq('organization_id', context.organization.id)
      .eq('role', 'rider')
      .eq('is_active', true)
      .eq('rider_eligible', true);
    if (memberships.error) throw memberships.error;
    const data = (memberships.data || []).map((membership) => {
      const profile = Array.isArray(membership.profiles)
        ? membership.profiles[0]
        : membership.profiles;
      return {
        id: membership.user_id,
        user_id: membership.user_id,
        name: profile?.full_name || 'Rider',
      };
    });
    sendJson(response, 200, { data, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
