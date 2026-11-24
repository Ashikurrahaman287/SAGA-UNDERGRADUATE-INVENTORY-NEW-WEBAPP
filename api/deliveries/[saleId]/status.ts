import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { hasPermission } from '../../../src/lib/permissions/permission-utils.js';
const schema = z
  .object({
    status: z.enum(['out_for_delivery', 'delivered', 'failed', 'cancelled']),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();
export default async function status(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'PATCH')) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.deliveryUpdate);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = schema.parse(await readJson(request));
    if (
      input.status === 'delivered' &&
      !hasPermission(context.organization.role, permissions.deliveryComplete)
    ) {
      sendJson(
        response,
        403,
        { error: { code: 'FORBIDDEN', message: 'Delivery completion is not permitted.' } },
        getRequestId(request),
      );
      return;
    }
    const hash = createHash('sha256')
      .update(JSON.stringify({ saleId, status: input.status, notes: input.notes }))
      .digest('hex');
    const result = await context.client.rpc('update_delivery_status', {
      p_organization_id: context.organization.id,
      p_sale_id: saleId,
      p_new_status: input.status,
      p_notes: input.notes || null,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: hash,
    });
    if (result.error) {
      const message = result.error.message || '';
      sendJson(
        response,
        message.includes('access denied') ? 403 : 409,
        {
          error: {
            code: message.includes('access denied') ? 'FORBIDDEN' : 'INVALID_DELIVERY_TRANSITION',
            message: message.includes('access denied')
              ? 'Delivery access denied.'
              : 'This delivery transition is not allowed.',
          },
        },
        getRequestId(request),
      );
      return;
    }
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
