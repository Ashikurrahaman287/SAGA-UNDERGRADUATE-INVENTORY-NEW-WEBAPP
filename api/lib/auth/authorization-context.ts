import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../request-id.js';
import { sendError } from '../response.js';
import { getAuthContext, type AuthContext } from './session.js';
import { recordAuthEvent } from './audit.js';
import { AuthorizationError } from './authorization-errors.js';
import { hasPermission, type Permission } from '../../../src/lib/permissions/permission-utils.js';

export type VerifiedAuthorizationContext = {
  auth: AuthContext;
  organization: { id: string; name: string; role: 'admin' | 'moderator' | 'rider' };
  requestId: string;
  client: Awaited<ReturnType<typeof getAuthContext>>['client'];
};

export async function requireAuthorization(
  request: VercelRequest,
  response: VercelResponse,
  permission?: Permission,
): Promise<VerifiedAuthorizationContext> {
  const requestId = getRequestId(request);
  const { client, context } = await getAuthContext(request, response);
  if (!context) throw new AuthorizationError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  if (!context.organization)
    throw new AuthorizationError(
      403,
      'NO_ACTIVE_ORGANIZATION',
      'An active organization is required.',
    );
  const organization = {
    id: context.organization.organizationId,
    name: context.organization.organizationName,
    role: context.organization.role,
  };
  if (permission && !hasPermission(organization.role, permission)) {
    await recordAuthEvent({
      action: 'authorization_denied',
      actorUserId: context.user.id,
      entityId: context.user.id,
      requestId,
      organizationId: organization.id,
      metadata: { permission },
    }).catch(() => undefined);
    throw new AuthorizationError(
      403,
      'FORBIDDEN',
      'You are not authorized to perform this action.',
    );
  }
  return { auth: context, organization, requestId, client };
}

export async function requirePermission(
  request: VercelRequest,
  response: VercelResponse,
  permission: Permission,
): Promise<VerifiedAuthorizationContext | null> {
  try {
    return await requireAuthorization(request, response, permission);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      sendError(response, error.status, error.code, error.message, getRequestId(request));
      return null;
    }
    throw error;
  }
}

export async function requireDeliveryAccess(
  context: VerifiedAuthorizationContext,
  deliveryId: string,
): Promise<Record<string, unknown> | null> {
  let query = context.client
    .from('delivery_assignments')
    .select(
      'id, organization_id, sale_id, rider_user_id, status, scheduled_at, assigned_at, delivered_at',
    )
    .eq('id', deliveryId)
    .eq('organization_id', context.organization.id);
  if (context.organization.role === 'rider')
    query = query.eq('rider_user_id', context.auth.user.id);
  const { data } = await query.maybeSingle();
  return data;
}
