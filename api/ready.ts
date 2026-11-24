import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isServerConfigurationReady } from './lib/env';
import { getRequestId } from './lib/request-id';
import { sendJson } from './lib/response';
import { getSupabaseServerClient } from './lib/supabase';

export default async function ready(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
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
  let databaseReady = false;
  if (configured) {
    try {
      const { error } = await getSupabaseServerClient().from('organizations').select('id').limit(1);
      databaseReady = !error;
    } catch {
      databaseReady = false;
    }
  }
  const readyState = configured && databaseReady;
  sendJson(
    response,
    readyState ? 200 : 503,
    {
      status: readyState ? 'ready' : 'not_ready',
      service: 'saga-inventory-api',
      checks: {
        configuration: configured ? 'ready' : 'missing',
        database: databaseReady ? 'ready' : 'unavailable',
      },
      requestId,
    },
    requestId,
  );
}
