import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { permissions } from '../../../src/lib/permissions/permission-registry';
export default async function products(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.suppliersView);
    if (!context) return;
    const id = z.string().uuid().parse(request.query.id);
    const result = await context.client
      .from('products')
      .select(
        'id, name, sku, category_id, cost_price, selling_price, quantity, is_active, categories(name)',
      )
      .eq('organization_id', context.organization.id)
      .eq('supplier_id', id)
      .order('name', { ascending: true });
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
