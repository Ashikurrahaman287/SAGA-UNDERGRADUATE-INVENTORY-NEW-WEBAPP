import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { paymentReceivedSms, sendSaleNotification } from '../../_lib/notifications.js';
const schema = z
  .object({
    amount: z.coerce.number().finite().positive(),
    paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'other']),
    paymentReference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();
export default async function collectPayment(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.paymentsCollect);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.saleId);
    const input = schema.parse(await readJson(request));
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          saleId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          notes: input.notes,
        }),
      )
      .digest('hex');
    const result = await context.client.rpc('collect_delivery_payment', {
      p_organization_id: context.organization.id,
      p_sale_id: saleId,
      p_amount: input.amount,
      p_payment_method: input.paymentMethod,
      p_payment_reference: input.paymentReference || null,
      p_notes: input.notes || null,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: hash,
    });
    if (result.error) {
      const message = result.error.message || '';
      sendJson(
        response,
        message.includes('Payment cannot exceed') ? 409 : message.includes('denied') ? 403 : 400,
        {
          error: {
            code: message.includes('Payment cannot exceed')
              ? 'OVERPAYMENT'
              : message.includes('denied')
                ? 'FORBIDDEN'
                : 'PAYMENT_COLLECTION_FAILED',
            message: message.includes('Payment cannot exceed')
              ? 'Payment cannot exceed the outstanding sale amount.'
              : message.includes('denied')
                ? 'Payment collection denied.'
                : 'Payment could not be collected.',
          },
        },
        getRequestId(request),
      );
      return;
    }
    const sale = await context.client
      .from('sales')
      .select('receipt_number,customers(name,phone)')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
      .maybeSingle();
    const customerRelation = sale.data?.customers;
    const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
    if (!sale.error && sale.data && customer) {
      await sendSaleNotification(
        {
          customerName: customer.name,
          phone: customer.phone,
          receiptNumber: sale.data.receipt_number,
          totalAmount: 0,
          amount: input.amount,
        },
        paymentReceivedSms({
          customerName: customer.name,
          phone: customer.phone,
          receiptNumber: sale.data.receipt_number,
          totalAmount: 0,
          amount: input.amount,
        }),
      ).catch(() => undefined);
    }
    sendJson(
      response,
      200,
      { data: result.data, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
