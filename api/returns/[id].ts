import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';

export default async function returnDetail(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.returnsView);
    if (!context) return;
    const id = z.string().uuid().parse(request.query.id);
    const returnRow = await context.client
      .from('returns')
      .select(
        '*, sales(id, receipt_number, customer_id, total_amount, fulfillment_status, customers(name, phone))',
      )
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .maybeSingle();
    if (returnRow.error) throw returnRow.error;
    if (!returnRow.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Return not found.' } },
        getRequestId(request),
      );
      return;
    }
    const [items, refunds, movements] = await Promise.all([
      context.client
        .from('return_items')
        .select(
          'id, sale_item_id, quantity, refund_amount, sale_items(product_name_snapshot, sku_snapshot, quantity, unit_price, line_total)',
        )
        .eq('organization_id', context.organization.id)
        .eq('return_id', id),
      context.client
        .from('refunds')
        .select('id, amount, refund_method, reason, approved_by, processed_by, status, created_at')
        .eq('organization_id', context.organization.id)
        .eq('return_id', id),
      context.client
        .from('stock_movements')
        .select(
          'id, product_id, movement_type, quantity, previous_quantity, new_quantity, reason, actor_user_id, created_at',
        )
        .eq('organization_id', context.organization.id)
        .eq('reference_type', 'return')
        .eq('reference_id', id),
    ]);
    if (items.error || refunds.error || movements.error)
      throw items.error || refunds.error || movements.error;
    sendJson(
      response,
      200,
      {
        data: {
          return: returnRow.data,
          items: items.data || [],
          refunds: refunds.data || [],
          stockMovements: movements.data || [],
        },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
