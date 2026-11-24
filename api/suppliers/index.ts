import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';
const schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactPerson: z.string().trim().max(200).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s().-]{7,20}$/),
    alternativePhone: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    address: z.string().trim().max(500).optional(),
    city: z.string().trim().max(120).optional(),
    website: z.string().trim().url().optional().or(z.literal('')),
    referenceCode: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict();
function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function phone(value: string): string {
  const clean = value.trim();
  return clean.startsWith('+') ? `+${clean.slice(1).replace(/\D/g, '')}` : clean.replace(/\D/g, '');
}
export default async function suppliers(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    const context = await requirePermission(
      request,
      response,
      request.method === 'GET' ? permissions.suppliersView : permissions.suppliersManage,
    );
    if (!context) return;
    if (request.method === 'GET') {
      const result = await context.client.rpc('list_suppliers', {
        p_organization_id: context.organization.id,
        p_search: queryValue(request.query.search) || null,
        p_active:
          queryValue(request.query.active) === 'all'
            ? null
            : queryValue(request.query.active) !== 'false',
        p_limit: Math.min(Number(queryValue(request.query.pageSize) || 25), 100),
        p_offset:
          (Math.max(Number(queryValue(request.query.page) || 1), 1) - 1) *
          Math.min(Number(queryValue(request.query.pageSize) || 25), 100),
      });
      if (result.error) throw result.error;
      sendJson(
        response,
        200,
        { data: result.data || { items: [], total: 0 }, requestId: getRequestId(request) },
        getRequestId(request),
      );
      return;
    }
    const input = schema.parse(await readJson(request));
    const result = await context.client
      .from('suppliers')
      .insert({
        organization_id: context.organization.id,
        name: input.name,
        contact_person: input.contactPerson || null,
        phone: phone(input.phone),
        alternative_phone: input.alternativePhone ? phone(input.alternativePhone) : null,
        email: input.email || null,
        address: input.address || null,
        city: input.city || null,
        website: input.website || null,
        reference_code: input.referenceCode || null,
        notes: input.notes || null,
        created_by: context.auth.user.id,
        updated_by: context.auth.user.id,
      })
      .select('id, name, reference_code, is_active, created_at')
      .single();
    if (result.error) {
      const status = result.error.code === '23505' ? 409 : 400;
      sendJson(
        response,
        status,
        {
          error: {
            code: status === 409 ? 'DUPLICATE_REFERENCE' : 'SUPPLIER_CREATE_FAILED',
            message:
              status === 409
                ? 'That supplier reference code is already in use.'
                : 'The supplier could not be created.',
          },
        },
        getRequestId(request),
      );
      return;
    }
    await context.client.from('audit_logs').insert({
      organization_id: context.organization.id,
      actor_user_id: context.auth.user.id,
      action: 'supplier_created',
      entity_type: 'supplier',
      entity_id: result.data.id,
    });
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
