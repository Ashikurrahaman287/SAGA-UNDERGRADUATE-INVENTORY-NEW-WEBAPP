import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
const schema = z
  .object({
    addressLabel: z.string().trim().max(80).optional(),
    recipientName: z.string().trim().max(200).optional(),
    recipientPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s().-]{7,20}$/)
      .optional(),
    addressLine: z.string().trim().min(1).max(300),
    area: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().max(40).optional(),
    deliveryInstructions: z.string().trim().max(500).optional(),
    isDefault: z.boolean().default(false),
  })
  .strict();
function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('+')
    ? `+${trimmed.slice(1).replace(/\D/g, '')}`
    : trimmed.replace(/\D/g, '');
}
export default async function addresses(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    const context = await requirePermission(request, response, permissions.customersUpdate);
    if (!context) return;
    const customerId = z.string().uuid().parse(request.query.id);
    const input = schema.parse(await readJson(request));
    const result = await context.client
      .from('customer_addresses')
      .insert({
        organization_id: context.organization.id,
        customer_id: customerId,
        address_label: input.addressLabel || null,
        recipient_name: input.recipientName || null,
        recipient_phone: input.recipientPhone ? normalizePhone(input.recipientPhone) : null,
        address_line: input.addressLine,
        area: input.area || null,
        city: input.city,
        postal_code: input.postalCode || null,
        delivery_instructions: input.deliveryInstructions || null,
        is_default: false,
      })
      .select(
        'id, customer_id, address_label, recipient_name, recipient_phone, address_line, area, city, postal_code, delivery_instructions, is_default, is_active, created_at, updated_at',
      )
      .single();
    if (result.error) throw result.error;
    if (input.isDefault) {
      const setDefault = await context.client.rpc('set_default_customer_address', {
        p_organization_id: context.organization.id,
        p_customer_id: customerId,
        p_address_id: result.data.id,
      });
      if (setDefault.error) throw setDefault.error;
    }
    sendJson(
      response,
      201,
      { data: result.data, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
