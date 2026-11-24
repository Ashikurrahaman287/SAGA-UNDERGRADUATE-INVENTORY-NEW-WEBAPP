import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
export default async function purchaseHistory(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.customersView);
    if (!context) return;
    const customerId = z.string().uuid().parse(request.query.id);
    const result = await context.client
      .from('sales')
      .select('id, receipt_number, total_amount, payment_status, fulfillment_status, created_at')
      .eq('organization_id', context.organization.id)
      .eq('customer_id', customerId)
      .neq('fulfillment_status', 'cancelled')
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
