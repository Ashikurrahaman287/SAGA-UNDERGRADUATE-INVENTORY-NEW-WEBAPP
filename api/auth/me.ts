import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { getAuthContext } from '../lib/auth/session';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http';

export default async function me(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const { context } = await getAuthContext(request, response);
    if (!context) {
      sendJson(response, 200, { authenticated: false }, getRequestId(request));
      return;
    }
    if (!context.memberships.length) {
      sendJson(
        response,
        403,
        { error: { code: 'NO_ACTIVE_MEMBERSHIP', message: 'No active organization membership.' } },
        getRequestId(request),
      );
      return;
    }
    if (!context.organization) {
      sendJson(
        response,
        409,
        {
          authenticated: true,
          organizationSelectionRequired: true,
          organizations: context.memberships.map(({ organizationId, organizationName, role }) => ({
            id: organizationId,
            name: organizationName,
            role,
          })),
        },
        getRequestId(request),
      );
      return;
    }
    sendJson(
      response,
      200,
      {
        authenticated: true,
        user: context.user,
        organization: {
          id: context.organization.organizationId,
          name: context.organization.organizationName,
          currency: context.organization.currency,
          timezone: context.organization.timezone,
        },
        role: context.organization.role,
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
