import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { recordAuthEvent } from '../lib/auth/audit';
import { methodNotAllowed, readJson, sendAuthFailure } from '../lib/auth/http';
import { getAuthContext } from '../lib/auth/session';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security';

const schema = z.object({
  password: z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});

export default async function resetPassword(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const { password } = schema.parse(await readJson(request));
    const { client, context } = await getAuthContext(request, response);
    if (!context) {
      sendJson(
        response,
        401,
        { error: { code: 'UNAUTHENTICATED', message: 'Recovery session is invalid or expired.' } },
        requestId,
      );
      return;
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      sendJson(
        response,
        400,
        {
          error: { code: 'PASSWORD_UPDATE_FAILED', message: 'The password could not be updated.' },
        },
        requestId,
      );
      return;
    }
    await recordAuthEvent({
      action: 'password_reset',
      actorUserId: context.user.id,
      entityId: context.user.id,
      requestId,
    });
    sendJson(response, 200, { message: 'Password updated successfully.' }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
