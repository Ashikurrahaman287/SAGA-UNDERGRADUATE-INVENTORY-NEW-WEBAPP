import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { permissions } from '../../../src/lib/permissions/permission-registry';

export default async function stockMovements(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.productsView);
    if (!context) return;
    const productId = z.string().uuid().parse(request.query.id);
    const result = await context.client
      .from('stock_movements')
      .select(
        'id, product_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, reference_id, reason, actor_user_id, created_at',
      )
      .eq('organization_id', context.organization.id)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (result.error) throw result.error;
    sendJson(
      response,
      200,
      { data: result.data || [], requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
