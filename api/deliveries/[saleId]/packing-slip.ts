import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';

export default async function packingSlip(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.packagingView);
    if (!context) return;
    const saleId = z.string().uuid().parse(request.query.saleId);
    let assignmentFilter = context.client
      .from('delivery_assignments')
      .select('id')
      .eq('organization_id', context.organization.id)
      .eq('sale_id', saleId);
    if (context.organization.role === 'rider')
      assignmentFilter = assignmentFilter.eq('rider_user_id', context.auth.user.id);
    const assignment = await assignmentFilter.maybeSingle();
    if (assignment.error) throw assignment.error;
    if (context.organization.role === 'rider' && !assignment.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Packing slip not found.' } },
        getRequestId(request),
      );
      return;
    }
    const sale = await context.client
      .from('sales')
      .select('id, receipt_number, delivery_address_snapshot, notes')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
      .maybeSingle();
    if (sale.error) throw sale.error;
    if (!sale.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Packing slip not found.' } },
        getRequestId(request),
      );
      return;
    }
    const items = await context.client
      .from('sale_items')
      .select('id, product_name_snapshot, sku_snapshot, quantity')
      .eq('organization_id', context.organization.id)
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true });
    if (items.error) throw items.error;
    sendJson(
      response,
      200,
      {
        data: {
          sale: sale.data,
          items: items.data || [],
          address: sale.data.delivery_address_snapshot,
        },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
