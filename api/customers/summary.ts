import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';
export default async function customerSummary(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.customersView);
    if (!context) return;
    const result = await context.client.rpc('get_customer_metrics', {
      p_organization_id: context.organization.id,
    });
    if (result.error) throw result.error;
    sendJson(
      response,
      200,
      {
        data: result.data || {
          totalCustomers: 0,
          activeCustomers: 0,
          newCustomers: 0,
          customersWithPurchases: 0,
        },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
