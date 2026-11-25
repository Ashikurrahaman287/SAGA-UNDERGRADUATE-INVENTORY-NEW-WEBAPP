import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';

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
    const body = await readJson(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.error('[packaging-invalid]', parsed.error.issues);
      sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'The request could not be processed.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }
    const input = parsed.data;
    const saleState = await context.client
      .from('sales')
      .select('fulfillment_status')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
      .maybeSingle();
    if (!saleState.error && saleState.data?.fulfillment_status === 'delivered') {
      sendJson(
        response,
        409,
        {
          error: {
            code: 'FULFILLMENT_ALREADY_DELIVERED',
            message: 'This sale is already delivered and cannot be moved back to packing.',
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }
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
