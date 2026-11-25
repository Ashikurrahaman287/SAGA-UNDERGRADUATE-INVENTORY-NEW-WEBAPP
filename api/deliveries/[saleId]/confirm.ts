import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { paymentReceivedSms, deliveryDeliveredSms, sendSaleNotification } from '../../_lib/notifications.js';

const schema = z.object({
  paymentAmount: z.coerce.number().finite().min(0),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'other']),
  paymentReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  deliverWithDue: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function confirmDelivery(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (methodNotAllowed(request, response, 'POST')) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.deliveryComplete);
    if (!context) return;
    if (context.organization.role !== 'admin') {
      sendJson(response, 403, { error: { code: 'FORBIDDEN', message: 'Only an Admin can complete deliveries.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = schema.parse(await readJson(request));

    const sale = await context.client.from('sales')
      .select('id,receipt_number,total_amount,confirmed_paid_amount,amount_paid,amount_due,payment_status,fulfillment_status,customers(name,phone)')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
      .maybeSingle();
    if (sale.error) throw sale.error;
    if (!sale.data) {
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Sale not found.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const due = Math.max(Number(sale.data.amount_due || 0), 0);
    if (input.paymentAmount > due) {
      sendJson(response, 400, { error: { code: 'PAYMENT_EXCEEDS_DUE', message: `Payment cannot exceed remaining due ${due.toFixed(2)}.` }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }
    if (due > input.paymentAmount && !input.deliverWithDue) {
      sendJson(response, 400, { error: { code: 'DUE_CONFIRMATION_REQUIRED', message: 'Confirm delivery with the remaining due balance, or record the full due.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const completed = await context.client.rpc('complete_sale_delivery', {
      p_organization_id: context.organization.id,
      p_sale_id: saleId,
      p_payment_amount: input.paymentAmount,
      p_payment_method: input.paymentMethod,
      p_payment_reference: input.paymentReference || null,
      p_notes: input.notes || null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (completed.error) throw completed.error;

    const event = await context.client.from('delivery_done_events')
      .select('payment_received,payment_sms_sent_at,delivery_sms_sent_at')
      .eq('organization_id', context.organization.id)
      .eq('sale_id', saleId)
      .maybeSingle();
    if (event.error) throw event.error;

    const relation = sale.data.customers;
    const customer = Array.isArray(relation) ? relation[0] : relation;
    let paymentSms = 'not_needed';
    let deliveredSms = 'not_needed';
    if (customer?.phone && event.data) {
      const paymentReceived = Number(event.data.payment_received || 0);
      if (paymentReceived > 0) {
        let paymentSentAt = event.data.payment_sms_sent_at;
        if (!paymentSentAt) {
          const claim = await context.client.rpc('claim_delivery_done_sms', {
            p_organization_id: context.organization.id, p_sale_id: saleId, p_kind: 'payment',
          });
          if (claim.error) throw claim.error;
          if (claim.data) {
            const sent = await sendSaleNotification(
              { customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount), amount: paymentReceived },
              paymentReceivedSms({ customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount), amount: paymentReceived }),
            ).catch(() => false);
            await context.client.rpc('complete_delivery_done_sms', {
              p_organization_id: context.organization.id, p_sale_id: saleId, p_kind: 'payment', p_sent: sent,
            });
            paymentSms = sent ? 'sent' : 'failed';
            if (sent) paymentSentAt = new Date().toISOString();
          } else paymentSms = 'already_sending';
        } else paymentSms = 'already_sent';

        if (!paymentSentAt) {
          sendJson(response, 200, { data: { ...completed.data, paymentSms, deliveredSms: 'waiting_for_payment_sms' }, requestId: getRequestId(request) }, getRequestId(request));
          return;
        }
        const elapsed = Date.now() - new Date(paymentSentAt).getTime();
        if (elapsed < 2000) await wait(2000 - elapsed);
      }

      const refreshed = await context.client.from('delivery_done_events')
        .select('delivery_sms_sent_at')
        .eq('organization_id', context.organization.id)
        .eq('sale_id', saleId)
        .maybeSingle();
      if (refreshed.error) throw refreshed.error;
      if (refreshed.data?.delivery_sms_sent_at) {
        deliveredSms = 'already_sent';
      } else {
        const claim = await context.client.rpc('claim_delivery_done_sms', {
          p_organization_id: context.organization.id, p_sale_id: saleId, p_kind: 'delivery',
        });
        if (claim.error) throw claim.error;
        if (claim.data) {
          const sent = await sendSaleNotification(
            { customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount) },
            deliveryDeliveredSms({ customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount) }),
          ).catch(() => false);
          await context.client.rpc('complete_delivery_done_sms', {
            p_organization_id: context.organization.id, p_sale_id: saleId, p_kind: 'delivery', p_sent: sent,
          });
          deliveredSms = sent ? 'sent' : 'failed';
        } else deliveredSms = 'already_sending';
      }
    }

    sendJson(response, 200, { data: { ...completed.data, paymentSms, deliveredSms }, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
