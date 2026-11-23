import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from './lib/request-id';
import { sendJson } from './lib/response';

export default function health(request: VercelRequest, response: VercelResponse): void {
  const requestId = getRequestId(request);
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(
      response,
      405,
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, requestId },
      requestId,
    );
    return;
  }
  sendJson(
    response,
    200,
    {
      status: 'ok',
      service: 'saga-inventory-api',
      timestamp: new Date().toISOString(),
      requestId,
    },
    requestId,
  );
}
