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
      const deliverySelect =
        'id, receipt_number, customer_id, total_amount, confirmed_paid_amount, amount_paid, amount_due, payment_status, delivery_scheduled_at, delivery_address_snapshot, fulfillment_status, created_at, customers(name, phone, email), sale_items(product_name_snapshot, sku_snapshot, quantity, unit_price, line_total), delivery_assignments(id, status, scheduled_at, assigned_at, delivered_at)';
      const [activeResult, deliveredSalesResult, deliveredAssignmentsResult] = await Promise.all([
        context.client
        .from('sales')
        .select(deliverySelect)
        .eq('organization_id', context.organization.id)
        .in('fulfillment_status', ['ready_for_delivery', 'out_for_delivery'])
        .order('delivery_scheduled_at', { ascending: true, nullsFirst: false }),
        context.client.from('sales')
          .select(deliverySelect)
          .eq('organization_id', context.organization.id)
          .eq('fulfillment_status', 'delivered')
          .order('delivery_scheduled_at', { ascending: false, nullsFirst: false }),
        context.client.from('delivery_assignments')
          .select(`id, sale_id, status, scheduled_at, assigned_at, delivered_at, sales(${deliverySelect})`)
          .eq('organization_id', context.organization.id)
          .not('delivered_at', 'is', null),
      ]);
      if (activeResult.error) throw activeResult.error;
      if (deliveredSalesResult.error) throw deliveredSalesResult.error;
      if (deliveredAssignmentsResult.error) throw deliveredAssignmentsResult.error;

      type ActiveSale = NonNullable<typeof activeResult.data>[number];
      type CompletedAssignment = NonNullable<typeof deliveredAssignmentsResult.data>[number];
      const toDeliveryRow = (sale: ActiveSale, assignment?: CompletedAssignment, completed = false) => ({
        id: assignment?.id || sale.id,
        sale_id: sale.id,
        status: completed ? 'delivered' : sale.fulfillment_status === 'ready_for_delivery' ? 'assigned' : sale.fulfillment_status,
        scheduled_at: assignment?.scheduled_at || sale.delivery_scheduled_at,
        assigned_at: assignment?.assigned_at || null,
        delivered_at: assignment?.delivered_at || null,
        created_at: sale.created_at,
        sales: sale,
      });
      const activeData = (activeResult.data || []).filter((sale) => {
        const relation = sale.delivery_assignments;
        const assignments = Array.isArray(relation) ? relation : relation ? [relation] : [];
        return !assignments.some((assignment) =>
          Boolean(assignment.delivered_at) || ['delivered', 'cancelled', 'failed'].includes(assignment.status || ''),
        );
      }).map((sale) => toDeliveryRow(sale));
      const completed = new Map<string, Record<string, unknown>>();
      for (const sale of deliveredSalesResult.data || []) {
        completed.set(sale.id, toDeliveryRow(sale, undefined, true));
      }
      for (const assignment of deliveredAssignmentsResult.data || []) {
        const relation = assignment.sales;
        const sale = Array.isArray(relation) ? relation[0] : relation;
        if (!sale || completed.has(sale.id)) continue;
        completed.set(sale.id, toDeliveryRow(sale, assignment, true));
      }
      const timezone = context.auth.organization?.timezone || 'Asia/Dhaka';
      sendJson(response, 200, {
        data: activeData,
        completed: [...completed.values()],
        timezone,
        requestId: getRequestId(request),
      }, getRequestId(request));
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
    sendJson(response, 200, {
      data,
      completed: [],
      timezone: context.auth.organization?.timezone || 'Asia/Dhaka',
      requestId: getRequestId(request),
    }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
