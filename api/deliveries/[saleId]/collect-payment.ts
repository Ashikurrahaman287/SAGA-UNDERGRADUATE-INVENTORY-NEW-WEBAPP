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
    amount: z.coerce.number().finite().positive(),
    paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'other']),
    paymentReference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();
export default async function collectPayment(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.paymentsCollect);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = schema.parse(await readJson(request));
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          saleId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          notes: input.notes,
        }),
      )
      .digest('hex');
    const result = await context.client.rpc('collect_delivery_payment', {
      p_organization_id: context.organization.id,
      p_sale_id: saleId,
      p_amount: input.amount,
      p_payment_method: input.paymentMethod,
      p_payment_reference: input.paymentReference || null,
      p_notes: input.notes || null,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: hash,
    });
    if (result.error) {
      const message = result.error.message || '';
      sendJson(
        response,
        message.includes('Payment cannot exceed') ? 409 : message.includes('denied') ? 403 : 400,
        {
          error: {
            code: message.includes('Payment cannot exceed')
              ? 'OVERPAYMENT'
              : message.includes('denied')
                ? 'FORBIDDEN'
                : 'PAYMENT_COLLECTION_FAILED',
            message: message.includes('Payment cannot exceed')
              ? 'Payment cannot exceed the outstanding sale amount.'
              : message.includes('denied')
                ? 'Payment collection denied.'
                : 'Payment could not be collected.',
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
