import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

export default async function deliveries(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.deliveryView);
    if (!context) return;
    let query = context.client
      .from('delivery_assignments')
      .select(
        'id, sale_id, rider_user_id, status, scheduled_at, assigned_at, delivered_at, created_at, sales(id, receipt_number, total_amount, amount_due, delivery_address_snapshot, fulfillment_status, customers(name, phone))',
        { count: 'exact' },
      )
      .eq('organization_id', context.organization.id)
      .order('scheduled_at', { ascending: true, nullsFirst: false });
    if (context.organization.role === 'rider')
      query = query.eq('rider_user_id', context.auth.user.id);
    const result = await query;
    if (result.error) throw result.error;
    const data =
      context.organization.role === 'rider'
        ? (result.data || []).map((row) => {
            const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
            const customerRelation = sale?.customers;
            const customer = Array.isArray(customerRelation)
              ? customerRelation[0]
              : customerRelation;
            return {
              id: row.id,
              status: row.status,
              scheduled_at: row.scheduled_at,
              sale: {
                receipt_number: sale?.receipt_number,
                total_amount: sale?.total_amount,
                amount_due: sale?.amount_due,
                delivery_address_snapshot: sale?.delivery_address_snapshot,
                customer_name: customer?.name,
                customer_phone: customer?.phone,
              },
              sale_items: [],
            };
          })
        : result.data || [];
    sendJson(response, 200, { data, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
