import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
const schema = z
  .object({
    channel: z.enum(['sms', 'email']),
    consentStatus: z.enum(['granted', 'denied', 'unknown']),
    source: z.string().trim().max(120).optional(),
  })
  .strict();
export default async function consent(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    const context = await requirePermission(request, response, permissions.communicationsManage);
    if (!context) return;
    const customerId = z.string().uuid().parse(request.query.id);
    const input = schema.parse(await readJson(request));
    const result = await context.client
      .from('communication_consents')
      .upsert(
        {
          organization_id: context.organization.id,
          customer_id: customerId,
          channel: input.channel,
          consent_status: input.consentStatus,
          consent_source: input.source || null,
          updated_by: context.auth.user.id,
        },
        { onConflict: 'organization_id,customer_id,channel' },
      )
      .select('id, channel, consent_status, consent_source, updated_by, updated_at')
      .single();
    if (result.error) throw result.error;
    sendJson(
      response,
      200,
      { data: result.data, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
