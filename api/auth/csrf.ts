import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { setCsrfCookie } from '../lib/auth/security';

export default function csrf(request: VercelRequest, response: VercelResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(
      response,
      405,
      {
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
    return;
  }
  const token = setCsrfCookie(response);
  sendJson(response, 200, { csrfToken: token }, getRequestId(request));
}
