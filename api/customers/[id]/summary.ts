import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { permissions } from '../../../src/lib/permissions/permission-registry';
export default async function summary(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.customersView);
    if (!context) return;
    const customerId = z.string().uuid().parse(request.query.id);
    const result = await context.client.rpc('get_customer_summary', {
      p_organization_id: context.organization.id,
      p_customer_id: customerId,
    });
    if (result.error) throw result.error;
    sendJson(
      response,
      200,
      {
        data: result.data || {
          totalOrders: 0,
          totalPurchase: 0,
          averageOrderValue: 0,
          lastPurchase: null,
        },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
