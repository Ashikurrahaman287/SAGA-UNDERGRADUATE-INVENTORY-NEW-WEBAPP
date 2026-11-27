import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';
import { isPackagingWorkflowActive } from '../../src/features/fulfillment/delivery-date.js';

export default async function packaging(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.packagingView);
    if (!context) return;
    const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
    let query = context.client
      .from('packaging_records')
      .select(
        'id, sale_id, packaging_status, packaging_cost, packed_by, packed_at, ready_at, updated_at, sales(id, receipt_number, customer_id, fulfillment_status, payment_status, delivery_address_snapshot, customers(name, phone), delivery_assignments(status, delivered_at))',
        { count: 'exact' },
      )
      .eq('organization_id', context.organization.id)
      .in('packaging_status', ['pending', 'in_progress', 'packed'])
      .order('updated_at', { ascending: false });
    if (search) {
      query = query.or(
        `sales.receipt_number.ilike.%${search}%,sales.customers.name.ilike.%${search}%,sales.customers.phone.ilike.%${search}%`,
      );
    }
    const result = await query;
    if (result.error) throw result.error;
    const data = (result.data || []).filter((row) => {
      const relation = row.sales;
      const sale = Array.isArray(relation) ? relation[0] : relation;
      if (!sale) return false;
      const deliveryRelation = sale.delivery_assignments;
      const assignments = Array.isArray(deliveryRelation)
        ? deliveryRelation
        : deliveryRelation
          ? [deliveryRelation]
          : [];
      return isPackagingWorkflowActive(sale.fulfillment_status, assignments);
    });
    sendJson(
      response,
      200,
      { data, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
