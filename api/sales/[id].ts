import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';

export default async function sale(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.salesView);
    if (!context) return;
    const id = z.string().uuid().parse(request.query.id);
    const sale = await context.client
      .from('sales')
      .select('*, customers(id, name, phone, email), sellers(id, name, reference_code)')
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .maybeSingle();
    if (sale.error) throw sale.error;
    if (!sale.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Sale not found.' } },
        getRequestId(request),
      );
      return;
    }
    const [items, payments, receipt] = await Promise.all([
      context.client
        .from('sale_items')
        .select(
          'id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price, unit_cost_snapshot, discount_amount, line_total, created_at',
        )
        .eq('organization_id', context.organization.id)
        .eq('sale_id', id)
        .order('created_at', { ascending: true }),
      context.client
        .from('payments')
        .select(
          'id, amount, payment_method, payment_reference, collected_by, collected_at, status, notes, created_at',
        )
        .eq('organization_id', context.organization.id)
        .eq('sale_id', id)
        .order('created_at', { ascending: true }),
      context.client
        .from('receipts')
        .select('id, receipt_number, issued_at, snapshot')
        .eq('organization_id', context.organization.id)
        .eq('sale_id', id)
        .maybeSingle(),
    ]);
    if (items.error || payments.error || receipt.error)
      throw items.error || payments.error || receipt.error;
    const paymentRows = payments.data || [];
    const confirmedPaid = paymentRows
      .filter((payment) => payment.status === 'completed')
      .reduce((total, payment) => total + Number(payment.amount), 0);
    sendJson(
      response,
      200,
      {
        data: {
          sale: sale.data,
          items: items.data || [],
          payments: paymentRows,
          confirmedPaid,
          receipt: receipt.data,
        },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
