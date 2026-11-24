import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security';
import { permissions } from '../../src/lib/permissions/permission-registry';

const createSchema = z
  .object({
    saleId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(8).max(128),
    reason: z.string().trim().min(1).max(500),
    restockDecision: z.enum(['restock', 'discard']),
    refundMethod: z.enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'other']),
    refundAmount: z.coerce.number().finite().min(0),
    items: z
      .array(
        z.object({ saleItemId: z.string().uuid(), quantity: z.number().int().positive() }).strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function returns(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    if (request.method === 'GET') {
      const context = await requirePermission(request, response, permissions.returnsView);
      if (!context) return;
      const status = queryValue(request.query.status);
      const search = queryValue(request.query.search);
      const page = Math.max(1, Number(queryValue(request.query.page) || 1));
      const pageSize = Math.min(100, Math.max(1, Number(queryValue(request.query.pageSize) || 25)));
      let query = context.client
        .from('returns')
        .select(
          'id, sale_id, return_number, reason, status, restock_decision, total_amount, created_at, approved_by, created_by, sales(receipt_number, customers(name))',
          { count: 'exact' },
        )
        .eq('organization_id', context.organization.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (status) query = query.eq('status', status);
      if (search) query = query.or(`return_number.ilike.%${search}%,reason.ilike.%${search}%`);
      const result = await query;
      if (result.error) throw result.error;
      sendJson(
        response,
        200,
        {
          data: result.data || [],
          total: result.count || 0,
          page,
          pageSize,
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }

    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.returnsCreate);
    if (!context) return;
    const input = createSchema.parse(await readJson(request));
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          saleId: input.saleId,
          reason: input.reason,
          restockDecision: input.restockDecision,
          refundMethod: input.refundMethod,
          refundAmount: input.refundAmount,
          items: input.items,
        }),
      )
      .digest('hex');
    const result = await context.client.rpc('create_return_transaction', {
      p_organization_id: context.organization.id,
      p_sale_id: input.saleId,
      p_request_hash: hash,
      p_idempotency_key: input.idempotencyKey,
      p_reason: input.reason,
      p_restock_decision: input.restockDecision,
      p_refund_method: input.refundMethod,
      p_refund_requested: input.refundAmount,
      p_items: input.items.map((item) => ({
        sale_item_id: item.saleItemId,
        quantity: item.quantity,
      })),
      p_request_id: context.requestId,
    });
    if (result.error) {
      const message = result.error.message || '';
      const moderatorPolicy = message.includes('Moderator returns policy disabled');
      const quantity = message.includes('Returned quantity exceeds');
      sendJson(
        response,
        moderatorPolicy ? 403 : quantity ? 409 : 400,
        {
          error: {
            code: moderatorPolicy
              ? 'FORBIDDEN'
              : quantity
                ? 'RETURN_QUANTITY_EXCEEDED'
                : 'RETURN_CREATE_FAILED',
            message: moderatorPolicy
              ? 'Returns are not enabled for this Moderator organization.'
              : quantity
                ? 'Requested quantities exceed the original sale quantities.'
                : 'The return could not be processed.',
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }
    sendJson(
      response,
      201,
      { data: result.data, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
