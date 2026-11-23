import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

export default async function lowStock(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.productsView);
    if (!context) return;
    const result = await context.client.rpc('list_products', {
      p_organization_id: context.organization.id,
      p_search: null,
      p_category_id: null,
      p_supplier_id: null,
      p_active: true,
      p_stock_status: 'low_stock',
      p_sort: 'quantity',
      p_ascending: true,
      p_limit: 100,
      p_offset: 0,
    });
    if (result.error) throw result.error;
    sendJson(
      response,
      200,
      { data: result.data || { items: [], total: 0 }, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
