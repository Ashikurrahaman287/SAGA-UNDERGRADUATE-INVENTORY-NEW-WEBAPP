import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
  purchaseActivity: z.enum(['with_purchases', 'without_purchases']).optional(),
  sort: z
    .enum(['name', 'created_at', 'last_purchase', 'total_orders', 'total_purchase'])
    .default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s().-]{7,20}$/, 'Enter a valid phone number.');
const addressSchema = z
  .object({
    addressLabel: z.string().trim().max(80).optional(),
    recipientName: z.string().trim().max(200).optional(),
    recipientPhone: phoneSchema.optional(),
    addressLine: z.string().trim().min(1).max(300),
    area: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().max(40).optional(),
    deliveryInstructions: z.string().trim().max(500).optional(),
    isDefault: z.boolean().default(true),
  })
  .strict();
const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: phoneSchema,
    email: z.string().trim().email().optional().or(z.literal('')),
    notes: z.string().trim().max(5000).optional(),
    communicationPreferences: z
      .record(z.string(), z.enum(['granted', 'denied', 'unknown']))
      .optional(),
    initialAddress: addressSchema.optional(),
  })
  .strict();
function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('+')
    ? `+${trimmed.slice(1).replace(/\D/g, '')}`
    : trimmed.replace(/\D/g, '');
}
function addressPayload(address: z.infer<typeof addressSchema>): Record<string, unknown> {
  return {
    address_label: address.addressLabel || null,
    recipient_name: address.recipientName || null,
    recipient_phone: address.recipientPhone ? normalizePhone(address.recipientPhone) : null,
    address_line: address.addressLine,
    area: address.area || null,
    city: address.city,
    postal_code: address.postalCode || null,
    delivery_instructions: address.deliveryInstructions || null,
    is_default: address.isDefault,
  };
}

export default async function customers(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    const context = await requirePermission(
      request,
      response,
      request.method === 'GET' ? permissions.customersView : permissions.customersCreate,
    );
    if (!context) return;
    if (request.method === 'GET') {
      const input = listSchema.parse({
        search: queryValue(request.query.search),
        active: queryValue(request.query.active),
        purchaseActivity: queryValue(request.query.purchaseActivity),
        sort: queryValue(request.query.sort),
        direction: queryValue(request.query.direction),
        page: queryValue(request.query.page),
        pageSize: queryValue(request.query.pageSize),
      });
      const result = await context.client.rpc('list_customers', {
        p_organization_id: context.organization.id,
        p_search: input.search || null,
        p_active: input.active === 'all' ? null : input.active === 'true',
        p_purchase_activity: input.purchaseActivity || null,
        p_sort: input.sort,
        p_ascending: input.direction === 'asc',
        p_limit: input.pageSize,
        p_offset: (input.page - 1) * input.pageSize,
      });
      if (result.error) throw result.error;
      sendJson(
        response,
        200,
        {
          data: result.data || { items: [], total: 0 },
          page: input.page,
          pageSize: input.pageSize,
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }
    const input = createSchema.parse(await readJson(request));
    const result = await context.client.rpc('create_customer_with_address', {
      p_organization_id: context.organization.id,
      p_name: input.name,
      p_phone: normalizePhone(input.phone),
      p_email: input.email || null,
      p_notes: input.notes || null,
      p_communication_preferences: input.communicationPreferences || {},
      p_initial_address: input.initialAddress ? addressPayload(input.initialAddress) : null,
    });
    if (result.error) throw result.error;
    sendJson(
      response,
      201,
      { data: { id: result.data }, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
