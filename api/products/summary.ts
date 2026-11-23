import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

export default async function productSummary(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.productsView);
    if (!context) return;
    const result = await context.client.rpc('get_product_summary', {
      p_organization_id: context.organization.id,
    });
    if (result.error) throw result.error;
    sendJson(
      response,
      200,
      {
        data: result.data || { totalProducts: 0, activeProducts: 0, outOfStock: 0, lowStock: 0 },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
