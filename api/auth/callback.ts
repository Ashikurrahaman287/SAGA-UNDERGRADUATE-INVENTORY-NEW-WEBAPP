import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAuthClient } from '../lib/auth/session';

export default async function callback(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const code = typeof request.query.code === 'string' ? request.query.code : undefined;
  if (!code) {
    response.status(400).json({
      error: {
        code: 'INVALID_RECOVERY_LINK',
        message: 'The recovery link is invalid or expired.',
      },
    });
    return;
  }
  try {
    const auth = createAuthClient(request, response);
    const { error } = await auth.client.auth.exchangeCodeForSession(code);
    if (error) {
      response.status(400).json({
        error: {
          code: 'INVALID_RECOVERY_LINK',
          message: 'The recovery link is invalid or expired.',
        },
      });
      return;
    }
    auth.commit();
    response.status(302).setHeader('Location', '/reset-password').end();
  } catch {
    response.status(503).json({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'The authentication service is temporarily unavailable.',
      },
    });
  }
}
