import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s().-]{7,20}$/, 'Enter a valid phone number.');
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: phoneSchema.optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    notes: z.string().trim().max(5000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('+')
    ? `+${trimmed.slice(1).replace(/\D/g, '')}`
    : trimmed.replace(/\D/g, '');
}
function customerId(request: VercelRequest): string {
  return z.string().uuid().parse(request.query.id);
}
export default async function customer(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!['GET', 'PATCH'].includes(request.method || '')) {
    response.setHeader('Allow', 'GET, PATCH');
    sendJson(
      response,
      405,
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
      getRequestId(request),
    );
    return;
  }
  try {
    const id = customerId(request);
    const context = await requirePermission(
      request,
      response,
      request.method === 'GET' ? permissions.customersView : permissions.customersUpdate,
    );
    if (!context) return;
    if (request.method === 'GET') {
      const [customer, addresses, notes, consents] = await Promise.all([
        context.client
          .from('customers')
          .select(
            'id, name, phone, email, notes, communication_preferences, is_active, created_at, updated_at',
          )
          .eq('organization_id', context.organization.id)
          .eq('id', id)
          .maybeSingle(),
        context.client
          .from('customer_addresses')
          .select(
            'id, customer_id, address_label, recipient_name, recipient_phone, address_line, area, city, postal_code, delivery_instructions, is_default, is_active, created_at, updated_at',
          )
          .eq('organization_id', context.organization.id)
          .eq('customer_id', id)
          .eq('is_active', true)
          .order('is_default', { ascending: false }),
        context.client
          .from('customer_notes')
          .select('id, note, author_user_id, created_at')
          .eq('organization_id', context.organization.id)
          .eq('customer_id', id)
          .order('created_at', { ascending: false }),
        context.client
          .from('communication_consents')
          .select('id, channel, consent_status, consent_source, updated_by, updated_at')
          .eq('organization_id', context.organization.id)
          .eq('customer_id', id),
      ]);
      if (customer.error) throw customer.error;
      if (!customer.data) {
        sendJson(
          response,
          404,
          { error: { code: 'NOT_FOUND', message: 'Customer not found.' } },
          getRequestId(request),
        );
        return;
      }
      sendJson(
        response,
        200,
        {
          data: {
            ...customer.data,
            addresses: addresses.data || [],
            notes: notes.data || [],
            consents: consents.data || [],
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }
    const input = updateSchema.parse(await readJson(request));
    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.phone !== undefined) changes.phone = normalizePhone(input.phone);
    if (input.email !== undefined) changes.email = input.email || null;
    if (input.notes !== undefined) changes.notes = input.notes || null;
    if (input.isActive !== undefined) changes.is_active = input.isActive;
    const result = await context.client
      .from('customers')
      .update(changes)
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .select('id, name, phone, email, notes, is_active, created_at, updated_at')
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Customer not found.' } },
        getRequestId(request),
      );
      return;
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
