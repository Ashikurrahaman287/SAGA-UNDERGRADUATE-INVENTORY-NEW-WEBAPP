import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { getSupabaseServerClient } from '../../lib/supabase.js';

export default async function receipt(
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
      .select(
        'id, receipt_number, customer_id, seller_id, subtotal, discount_amount, delivery_fee, total_amount, amount_paid, amount_due, payment_status, payment_method, delivery_address_snapshot, notes, created_at, customers(name, phone), sellers(name, reference_code)',
      )
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .maybeSingle();
    if (sale.error) throw sale.error;
    if (!sale.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Receipt not found.' } },
        getRequestId(request),
      );
      return;
    }
    const organization = await context.client
      .from('organizations')
      .select('name, business_phone, business_email, business_address, currency, timezone')
      .eq('id', context.organization.id)
      .maybeSingle();
    const [items, settings] = await Promise.all([
      context.client
        .from('sale_items')
        .select('product_name_snapshot, sku_snapshot, quantity, unit_price, line_total')
        .eq('organization_id', context.organization.id)
        .eq('sale_id', id)
        .order('created_at', { ascending: true }),
      getSupabaseServerClient()
        .from('business_settings')
        .select('receipt_header, receipt_footer, receipt_notes')
        .eq('organization_id', context.organization.id)
        .maybeSingle(),
    ]);
    if (organization.error || items.error || settings.error)
      throw organization.error || items.error || settings.error;
    sendJson(
      response,
      200,
      {
        data: {
          organization: organization.data,
          settings: settings.data,
          sale: sale.data,
          items: items.data || [],
        },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
