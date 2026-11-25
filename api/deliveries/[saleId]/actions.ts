import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { canSendTransactionalEmail, renderOrderEmail, sendEmail } from '../../_lib/email.js';

export default async function deliveryActions(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (methodNotAllowed(request, response, 'POST')) return;

  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.deliveryUpdate);
    if (!context) return;
    if (context.organization.role !== 'admin') {
      sendJson(
        response,
        403,
        { error: { code: 'FORBIDDEN', message: 'Only an Admin can manage delivery actions.' }, requestId: getRequestId(request) },
        getRequestId(request),
      );
      return;
    }
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = z.object({
      action: z.enum(['reschedule', 'cancel', 'reminder']),
      scheduledAt: z.string().datetime().optional(),
      notes: z.string().trim().max(1000).optional(),
      idempotencyKey: z.string().trim().min(8).max(128),
    }).parse(await readJson(request));

    if (input.action === 'reschedule') {
      if (!input.scheduledAt) throw new z.ZodError([{ code: 'custom', path: ['scheduledAt'], message: 'Scheduled time is required.' }]);
      const result = await context.client.rpc('reschedule_delivery', {
        p_organization_id: context.organization.id,
        p_sale_id: saleId,
        p_scheduled_at: input.scheduledAt,
        p_notes: input.notes || null,
        p_idempotency_key: input.idempotencyKey,
      });
      if (result.error) throw result.error;
      sendJson(response, 200, { data: { rescheduled: true }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    if (input.action === 'cancel') {
      const result = await context.client.rpc('cancel_sale_with_restock', {
        p_organization_id: context.organization.id,
        p_sale_id: saleId,
        p_reason: input.notes || null,
        p_idempotency_key: input.idempotencyKey,
      });
      if (result.error) throw result.error;
      sendJson(response, 200, { data: result.data, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const sale = await context.client
      .from('sales')
      .select('id,receipt_number,customer_id,subtotal,discount_amount,delivery_fee,total_amount,confirmed_paid_amount,amount_paid,amount_due,payment_method,delivery_scheduled_at,delivery_address_snapshot,created_at,customers(name,email,phone)')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
      .maybeSingle();
    if (sale.error) throw sale.error;
    if (!sale.data) {
      sendJson(response, 404, { error: { code: 'SALE_NOT_FOUND', message: 'Sale not found.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }
    const customerRelation = sale.data?.customers;
    const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
    const email = typeof customer?.email === 'string' ? customer.email.trim() : '';
    if (!email) {
      sendJson(response, 400, { error: { code: 'EMAIL_REQUIRED', message: 'Customer email is required for a reminder.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const consent = await context.client
      .from('communication_consents')
      .select('consent_status')
      .eq('organization_id', context.organization.id)
      .eq('customer_id', sale.data.customer_id)
      .eq('channel', 'email')
      .maybeSingle();
    if (consent.error) throw consent.error;
    if (!canSendTransactionalEmail(consent.data?.consent_status)) {
      sendJson(response, 403, { error: { code: 'EMAIL_CONSENT_DENIED', message: 'Customer has opted out of email communications.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const log = await context.client.rpc('reserve_communication_send', {
      p_organization_id: context.organization.id,
      p_idempotency_key: input.idempotencyKey,
      p_channel: 'email',
      p_label: 'transactional',
      p_template_type: 'delivery_reminder',
      p_recipient: email,
      p_customer_id: sale.data?.customer_id || null,
      p_related_entity_type: 'sale',
      p_related_entity_id: saleId,
    });
    if (log.error) throw log.error;

    const prior = await context.client.from('communication_logs')
      .select('delivery_status,provider_message_id')
      .eq('organization_id', context.organization.id)
      .eq('id', log.data)
      .maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data?.delivery_status === 'sent' || prior.data?.delivery_status === 'delivered') {
      sendJson(response, 200, { data: { sent: true, idempotent: true, email }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const [items, organization] = await Promise.all([
      context.client.from('sale_items').select('product_name_snapshot,sku_snapshot,quantity,unit_price,line_total').eq('organization_id', context.organization.id).eq('sale_id', saleId).order('created_at'),
      context.client.from('organizations').select('name,currency').eq('id', context.organization.id).maybeSingle(),
    ]);
    if (items.error) throw items.error;
    if (organization.error) throw organization.error;
    const address = sale.data.delivery_address_snapshot as { address_line?: string; addressLine?: string; city?: string } | null;
    const rendered = renderOrderEmail({
      customerName: customer?.name || 'Customer',
      receiptNumber: sale.data.receipt_number,
      createdAt: sale.data.created_at,
      paymentMethod: sale.data.payment_method || 'Due',
      location: address?.addressLine || address?.address_line || address?.city,
      scheduledAt: sale.data.delivery_scheduled_at,
      items: (items.data || []).map((item) => ({
        name: item.product_name_snapshot,
        sku: item.sku_snapshot,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
      })),
      subtotal: Number(sale.data.subtotal),
      discount: Number(sale.data.discount_amount),
      deliveryFee: Number(sale.data.delivery_fee),
      total: Number(sale.data.total_amount),
      paid: Number(sale.data.confirmed_paid_amount ?? sale.data.amount_paid),
      due: Number(sale.data.amount_due),
      currency: organization.data?.currency || 'BDT',
      businessName: organization.data?.name || 'UNDERGRADUATE HUB',
      reminder: true,
    });
    const result = await sendEmail({
      to: email,
      subject: `Delivery reminder - ${sale.data.receipt_number}`,
      html: rendered,
      text: `Your order ${sale.data.receipt_number} is scheduled for delivery. Please keep your phone available.`,
    });

    const complete = await context.client.rpc('complete_communication_send', {
      p_organization_id: context.organization.id,
      p_log_id: log.data,
      p_status: result.sent ? 'sent' : 'failed',
      p_provider_error_code: result.sent ? null : 'EMAIL_SEND_FAILED',
      p_provider_message_id: result.messageId || null,
      p_provider_response: { provider: result.provider, error: result.error || null },
    });
    if (complete.error) throw complete.error;

    if (!result.sent) {
      sendJson(response, 502, { error: { code: 'EMAIL_SEND_FAILED', message: result.error || 'Email provider could not send the reminder.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }
    sendJson(response, 200, { data: { sent: true, email }, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
