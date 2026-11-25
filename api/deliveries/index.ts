import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';

export default async function deliveries(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.deliveryView);
    if (!context) return;
    if (context.organization.role === 'admin') {
      const result = await context.client
        .from('sales')
        .select(
          'id, receipt_number, total_amount, amount_due, delivery_scheduled_at, delivery_address_snapshot, fulfillment_status, customers(name, phone)',
          { count: 'exact' },
        )
        .eq('organization_id', context.organization.id)
        .in('fulfillment_status', ['pending', 'processing', 'packed', 'ready_for_delivery', 'out_for_delivery'])
        .order('delivery_scheduled_at', { ascending: true, nullsFirst: false });
      if (result.error) throw result.error;
      const data = (result.data || []).map((sale) => {
        const customerRelation = sale.customers;
        const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
        return {
          id: sale.id,
          sale_id: sale.id,
          rider_user_id: null,
          status: sale.fulfillment_status === 'ready_for_delivery' ? 'assigned' : sale.fulfillment_status,
          scheduled_at: sale.delivery_scheduled_at,
          assigned_at: null,
          delivered_at: null,
          created_at: null,
          sales: {
            receipt_number: sale.receipt_number,
            total_amount: sale.total_amount,
            amount_due: sale.amount_due,
            delivery_address_snapshot: sale.delivery_address_snapshot,
            customers: customer,
          },
        };
      });
      sendJson(response, 200, { data, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

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
