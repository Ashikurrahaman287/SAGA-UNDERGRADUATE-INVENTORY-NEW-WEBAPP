import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../../lib/request-id.js';
import { sendJson } from '../../../lib/response.js';
import { readJson, sendAuthFailure } from '../../../lib/auth/http.js';
import { requirePermission } from '../../../lib/auth/authorization-context.js';
import { permissions } from '../../../../src/lib/permissions/permission-registry.js';
const schema = z
  .object({
    addressLabel: z.string().trim().max(80).optional(),
    recipientName: z.string().trim().max(200).optional(),
    recipientPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s().-]{7,20}$/)
      .optional()
      .nullable(),
    addressLine: z.string().trim().min(1).max(300).optional(),
    area: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    postalCode: z.string().trim().max(40).optional(),
    deliveryInstructions: z.string().trim().max(500).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('+')
    ? `+${trimmed.slice(1).replace(/\D/g, '')}`
    : trimmed.replace(/\D/g, '');
}
export default async function address(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!['PATCH', 'POST'].includes(request.method || '')) {
    response.setHeader('Allow', 'PATCH, POST');
    sendJson(
      response,
      405,
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
      getRequestId(request),
    );
    return;
  }
  try {
    const context = await requirePermission(request, response, permissions.customersUpdate);
    if (!context) return;
    const customerId = z.string().uuid().parse(request.query.id);
    const addressId = z.string().uuid().parse(request.query.addressId);
    if (request.method === 'POST') {
      const result = await context.client.rpc('set_default_customer_address', {
        p_organization_id: context.organization.id,
        p_customer_id: customerId,
        p_address_id: addressId,
      });
      if (result.error) throw result.error;
      sendJson(
        response,
        200,
        { data: { default: true }, requestId: getRequestId(request) },
        getRequestId(request),
      );
      return;
    }
    const input = schema.parse(await readJson(request));
    const changes: Record<string, unknown> = {};
    if (input.addressLabel !== undefined) changes.address_label = input.addressLabel || null;
    if (input.recipientName !== undefined) changes.recipient_name = input.recipientName || null;
    if (input.recipientPhone !== undefined)
      changes.recipient_phone = input.recipientPhone ? normalizePhone(input.recipientPhone) : null;
    if (input.addressLine !== undefined) changes.address_line = input.addressLine;
    if (input.area !== undefined) changes.area = input.area || null;
    if (input.city !== undefined) changes.city = input.city;
    if (input.postalCode !== undefined) changes.postal_code = input.postalCode || null;
    if (input.deliveryInstructions !== undefined)
      changes.delivery_instructions = input.deliveryInstructions || null;
    if (input.isActive !== undefined) changes.is_active = input.isActive;
    if (input.isDefault !== undefined) changes.is_default = false;
    const result = await context.client
      .from('customer_addresses')
      .update(changes)
      .eq('organization_id', context.organization.id)
      .eq('customer_id', customerId)
      .eq('id', addressId)
      .select(
        'id, customer_id, address_label, recipient_name, recipient_phone, address_line, area, city, postal_code, delivery_instructions, is_default, is_active, created_at, updated_at',
      )
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Address not found.' } },
        getRequestId(request),
      );
      return;
    }
    if (input.isDefault) {
      const setDefault = await context.client.rpc('set_default_customer_address', {
        p_organization_id: context.organization.id,
        p_customer_id: customerId,
        p_address_id: addressId,
      });
      if (setDefault.error) throw setDefault.error;
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
