import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function salesSummary(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.salesView);
    if (!context) return;
    const input = z
      .object({
        customerId: z.string().uuid().optional(),
        sellerId: z.string().uuid().optional(),
        paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'refunded', 'voided']).optional(),
        fulfillmentStatus: z
          .enum([
            'pending',
            'processing',
            'packed',
            'ready_for_delivery',
            'out_for_delivery',
            'delivered',
            'cancelled',
          ])
          .optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse({
        customerId: queryValue(request.query.customerId),
        sellerId: queryValue(request.query.sellerId),
        paymentStatus: queryValue(request.query.paymentStatus),
        fulfillmentStatus: queryValue(request.query.fulfillmentStatus),
        from: queryValue(request.query.from),
        to: queryValue(request.query.to),
      });
    const organization = await context.client
      .from('organizations')
      .select('timezone')
      .eq('id', context.organization.id)
      .maybeSingle();
    if (organization.error) throw organization.error;
    const timezone = organization.data?.timezone || 'UTC';
    const { buildDashboardDateRange } = await import('../lib/dashboard/date-range');
    const range =
      input.from || input.to
        ? buildDashboardDateRange(input.from, input.to, timezone)
        : { start: null, end: null };
    const result = await context.client.rpc('get_sales_history_summary', {
      p_organization_id: context.organization.id,
      p_customer_id: input.customerId || null,
      p_seller_id: input.sellerId || null,
      p_payment_status: input.paymentStatus || null,
      p_fulfillment_status: input.fulfillmentStatus || null,
      p_from: range.start?.toISOString() || null,
      p_to: range.end?.toISOString() || null,
    });
    if (result.error) throw result.error;
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
