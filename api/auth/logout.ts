import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { recordAuthEvent } from '../lib/auth/audit.js';
import { methodNotAllowed, sendAuthFailure } from '../lib/auth/http.js';
import { clearAuthCookies, getAuthContext } from '../lib/auth/session.js';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security.js';

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
