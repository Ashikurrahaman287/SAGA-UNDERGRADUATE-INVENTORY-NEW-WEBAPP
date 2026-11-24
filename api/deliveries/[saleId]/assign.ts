import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security';
import { permissions } from '../../../src/lib/permissions/permission-registry';
const schema = z
  .object({
    riderUserId: z.string().uuid(),
    scheduledAt: z.string().datetime().optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();
export default async function assign(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.deliveryAssign);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = schema.parse(await readJson(request));
    const hash = createHash('sha256')
      .update(
        JSON.stringify({ saleId, riderUserId: input.riderUserId, scheduledAt: input.scheduledAt }),
      )
      .digest('hex');
    const result = await context.client.rpc('assign_delivery', {
      p_organization_id: context.organization.id,
      p_sale_id: saleId,
      p_rider_user_id: input.riderUserId,
      p_scheduled_at: input.scheduledAt || null,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: hash,
    });
    if (result.error) {
      sendJson(
        response,
        400,
        {
          error: { code: 'DELIVERY_ASSIGN_FAILED', message: 'The delivery could not be assigned.' },
          requestId: getRequestId(request),
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
