import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { recordAuthEvent } from '../lib/auth/audit';
import { methodNotAllowed, sendAuthFailure } from '../lib/auth/http';
import { clearAuthCookies, getAuthContext } from '../lib/auth/session';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security';

export default async function logout(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const { client, context } = await getAuthContext(request, response);
    await client.auth.signOut({ scope: 'global' });
    clearAuthCookies(request, response);
    if (context)
      await recordAuthEvent({
        action: 'logout',
        actorUserId: context.user.id,
        entityId: context.user.id,
        requestId,
      });
    sendJson(response, 200, { authenticated: false }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
