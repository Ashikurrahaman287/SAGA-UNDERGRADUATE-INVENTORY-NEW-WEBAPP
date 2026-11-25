import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { paymentReceivedSms, deliveryDeliveredSms, sendSaleNotification } from '../../_lib/notifications.js';

export default async function deliveryDone(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (methodNotAllowed(request, response, 'POST')) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.deliveryComplete);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = z.object({ idempotencyKey: z.string().trim().min(8).max(128) }).parse(await readJson(request));

    const sale = await context.client
      .from('sales')
      .select('id,receipt_number,total_amount,confirmed_paid_amount,amount_paid,amount_due,payment_status,customers(name,phone)')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
      .maybeSingle();
    if (sale.error) throw sale.error;
    if (!sale.data) {
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Sale not found.' }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    if (sale.data.payment_status === 'paid' && sale.data.fulfillment_status === 'delivered') {
      sendJson(response, 200, { data: { delivered: true, duePaid: 0, amountPaid: Number(sale.data.confirmed_paid_amount ?? sale.data.amount_paid ?? 0), idempotent: true }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const due = Math.max(Number(sale.data.amount_due || 0), 0);
    const confirmedPaid = due > 0
      ? Number(sale.data.confirmed_paid_amount ?? sale.data.amount_paid ?? 0) + due
      : Number(sale.data.confirmed_paid_amount ?? sale.data.amount_paid ?? 0);

    if (due > 0) {
      await context.client.from('payments').upsert({
        organization_id: context.organization.id,
        sale_id: saleId,
        amount: due,
        payment_method: 'cash',
        collected_by: context.auth.user.id,
        collected_at: new Date().toISOString(),
        status: 'completed',
        idempotency_key: `${input.idempotencyKey}:payment`,
        notes: 'Marked paid by Delivery Done',
      }, { onConflict: 'organization_id,idempotency_key' });
    }

    await context.client.from('sales').update({
      confirmed_paid_amount: confirmedPaid,
      amount_paid: confirmedPaid,
      amount_due: 0,
      payment_status: 'paid',
      fulfillment_status: 'delivered',
    }).eq('organization_id', context.organization.id).eq('id', saleId);

    await context.client.from('delivery_assignments').update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    }).eq('organization_id', context.organization.id).eq('sale_id', saleId);

    await context.client.from('packaging_records').update({
      packaging_status: 'ready',
      ready_at: new Date().toISOString(),
    }).eq('organization_id', context.organization.id).eq('sale_id', saleId);

    const customerRelation = sale.data.customers;
    const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
    if (customer && due > 0) {
      await sendSaleNotification(
        { customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount), amount: due },
        paymentReceivedSms({ customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount), amount: due }),
      ).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await sendSaleNotification(
        { customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount) },
        deliveryDeliveredSms({ customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount) }),
      ).catch(() => undefined);
    } else if (customer) {
      await sendSaleNotification(
        { customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount) },
        deliveryDeliveredSms({ customerName: customer.name, phone: customer.phone, receiptNumber: sale.data.receipt_number, totalAmount: Number(sale.data.total_amount) }),
      ).catch(() => undefined);
    }

    sendJson(response, 200, { data: { delivered: true, duePaid: due, amountPaid: confirmedPaid }, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
