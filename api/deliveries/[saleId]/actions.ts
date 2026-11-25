import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';

export default async function deliveryActions(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (methodNotAllowed(request, response, 'POST')) return;

  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.deliveryUpdate);
    if (!context) return;
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
      .select('receipt_number,customer_id,customers(name,email,phone)')
      .eq('organization_id', context.organization.id)
      .eq('id', saleId)
      .maybeSingle();
    if (sale.error) throw sale.error;
    const customerRelation = sale.data?.customers;
    const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
    const email = typeof customer?.email === 'string' ? customer.email.trim() : '';
    if (!email) {
      sendJson(response, 400, { error: { code: 'EMAIL_REQUIRED', message: 'Customer email is required for a reminder.' }, requestId: getRequestId(request) }, getRequestId(request));
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

    await context.client.rpc('complete_communication_send', {
      p_organization_id: context.organization.id,
      p_log_id: log.data,
      p_status: 'sent',
      p_provider_error_code: null,
      p_provider_message_id: null,
      p_provider_response: { emailProvider: 'pending_configuration', recipient: email },
    });

    sendJson(response, 200, { data: { reminderLogged: true, email }, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
