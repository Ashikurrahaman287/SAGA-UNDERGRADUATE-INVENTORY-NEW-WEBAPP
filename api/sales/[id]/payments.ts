import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';

export default async function salePayments(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.salesView);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.id);
    const sale = await context.client
      .from('sales')
      .select('id, total_amount, amount_paid, amount_due, payment_status')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
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
    const payments = await context.client
      .from('payments')
      .select(
        'id, amount, payment_method, payment_reference, collected_by, collected_at, status, notes, created_at',
      )
      .eq('organization_id', context.organization.id)
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true });
    if (payments.error) throw payments.error;
    const confirmed = (payments.data || [])
      .filter((payment) => payment.status === 'completed')
      .reduce((total, payment) => total + Number(payment.amount), 0);
    sendJson(
      response,
      200,
      {
        data: { sale: sale.data, confirmedPaid: confirmed, payments: payments.data || [] },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
