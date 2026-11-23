import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

const schema = z
  .object({
    productId: z.string().uuid(),
    direction: z.enum(['increase', 'decrease']),
    quantity: z.coerce.number().finite().positive(),
    reason: z.string().trim().min(1).max(500),
    referenceType: z.string().trim().max(80).optional(),
    referenceId: z.string().uuid().optional(),
  })
  .strict();
export default async function adjustment(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    const context = await requirePermission(request, response, permissions.productsStockAdjust);
    if (!context) return;
    const input = schema.parse(await readJson(request));
    const result = await context.client.rpc('adjust_product_stock', {
      p_organization_id: context.organization.id,
      p_product_id: input.productId,
      p_direction: input.direction,
      p_quantity: input.quantity,
      p_reason: input.reason,
      p_reference_type: input.referenceType || null,
      p_reference_id: input.referenceId || null,
    });
    if (result.error) {
      const insufficient = result.error.message?.includes('Insufficient stock');
      sendJson(
        response,
        insufficient ? 409 : 400,
        {
          error: {
            code: insufficient ? 'INSUFFICIENT_STOCK' : 'STOCK_ADJUSTMENT_FAILED',
            message: insufficient
              ? 'The decrease exceeds available stock.'
              : 'The stock adjustment could not be completed.',
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
