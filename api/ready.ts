import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isServerConfigurationReady } from './lib/env';
import { getRequestId } from './lib/request-id';
import { sendJson } from './lib/response';

export default function ready(request: VercelRequest, response: VercelResponse): void {
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
  const configured = isServerConfigurationReady();
  sendJson(
    response,
    configured ? 200 : 503,
    {
      status: configured ? 'ready' : 'not_ready',
      service: 'saga-inventory-api',
      requestId,
    },
    requestId,
  );
}
