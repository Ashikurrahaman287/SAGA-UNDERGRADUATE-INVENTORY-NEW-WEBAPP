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
    status: z.enum(['in_progress', 'packed', 'ready']),
    packagingCost: z.coerce.number().finite().min(0).default(0),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();

export default async function transition(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.packagingUpdate);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = schema.parse(await readJson(request));
    const hash = createHash('sha256')
      .update(JSON.stringify({ saleId, status: input.status, packagingCost: input.packagingCost }))
      .digest('hex');
    const result = await context.client.rpc('transition_packaging', {
      p_organization_id: context.organization.id,
      p_sale_id: saleId,
      p_new_status: input.status,
      p_packaging_cost: input.packagingCost,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: hash,
    });
    if (result.error) {
      const message = result.error.message || '';
      sendJson(
        response,
        message.includes('Invalid packaging transition') ? 409 : 400,
        {
          error: {
            code: message.includes('Invalid packaging transition')
              ? 'INVALID_STATUS_TRANSITION'
              : 'PACKAGING_UPDATE_FAILED',
            message: message.includes('Invalid packaging transition')
              ? 'This packaging transition is not allowed.'
              : 'The packaging status could not be updated.',
          },
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
