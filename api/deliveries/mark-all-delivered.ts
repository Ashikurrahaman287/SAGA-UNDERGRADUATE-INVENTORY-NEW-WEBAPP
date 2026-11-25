import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { methodNotAllowed, sendAuthFailure } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';
import { deliveryDeliveredSms, sendSaleNotification } from '../_lib/notifications.js';

export default async function markAllDelivered(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (methodNotAllowed(request, response, 'POST')) return;

  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.deliveryComplete);
    if (!context) return;

    const result = await context.client
      .from('delivery_assignments')
      .select('sale_id,status,sales(receipt_number,customers(name,phone))')
      .eq('organization_id', context.organization.id)
      .in('status', ['assigned', 'out_for_delivery']);
    if (result.error) throw result.error;

    let marked = 0;
    let skipped = 0;
    for (const row of result.data || []) {
      try {
        if (row.status === 'assigned') {
          await context.client.rpc('update_delivery_status', {
            p_organization_id: context.organization.id,
            p_sale_id: row.sale_id,
            p_new_status: 'out_for_delivery',
            p_notes: 'Marked out for delivery in bulk action',
            p_idempotency_key: `bulk-out-${row.sale_id}-${Date.now()}`,
            p_request_hash: createHash('sha256').update(`bulk-out:${row.sale_id}`).digest('hex'),
          });
        }

        const delivered = await context.client.rpc('update_delivery_status', {
          p_organization_id: context.organization.id,
          p_sale_id: row.sale_id,
          p_new_status: 'delivered',
          p_notes: 'Marked delivered in bulk action',
          p_idempotency_key: `bulk-delivered-${row.sale_id}-${Date.now()}`,
          p_request_hash: createHash('sha256').update(`bulk-delivered:${row.sale_id}`).digest('hex'),
        });
        if (delivered.error) throw delivered.error;

        const saleRelation = Array.isArray(row.sales) ? row.sales[0] : row.sales;
        const customerRelation = saleRelation?.customers;
        const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
        if (saleRelation?.receipt_number && customer) {
          await sendSaleNotification(
            {
              customerName: customer.name,
              phone: customer.phone,
              receiptNumber: saleRelation.receipt_number,
              totalAmount: 0,
            },
            deliveryDeliveredSms({
              customerName: customer.name,
              phone: customer.phone,
              receiptNumber: saleRelation.receipt_number,
              totalAmount: 0,
            }),
          ).catch(() => undefined);
        }
        marked++;
      } catch {
        skipped++;
      }
    }

    sendJson(
      response,
      200,
      { data: { marked, skipped }, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
