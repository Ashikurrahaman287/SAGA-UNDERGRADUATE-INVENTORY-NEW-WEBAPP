import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { readJson, sendAuthFailure } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';
const schema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    contactPerson: z.string().trim().max(200).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s().-]{7,20}$/)
      .optional(),
    alternativePhone: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    address: z.string().trim().max(500).optional(),
    city: z.string().trim().max(120).optional(),
    website: z.string().trim().url().optional().or(z.literal('')),
    referenceCode: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(5000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
function phone(value: string): string {
  const clean = value.trim();
  return clean.startsWith('+') ? `+${clean.slice(1).replace(/\D/g, '')}` : clean.replace(/\D/g, '');
}
export default async function supplier(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!['GET', 'PATCH', 'POST'].includes(request.method || '')) {
    response.setHeader('Allow', 'GET, PATCH, POST');
    sendJson(
      response,
      405,
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
      getRequestId(request),
    );
    return;
  }
  try {
    const context = await requirePermission(request, response, permissions.suppliersManage);
    if (!context) return;
    const id = z.string().uuid().parse(request.query.id);
    if (request.method === 'GET') {
      const result = await context.client
        .from('suppliers')
        .select(
          'id, name, contact_person, phone, alternative_phone, email, address, city, website, reference_code, notes, is_active, created_at, updated_at',
        )
        .eq('organization_id', context.organization.id)
        .eq('id', id)
        .maybeSingle();
      if (result.error) throw result.error;
      await context.client.from('audit_logs').insert({
        organization_id: context.organization.id,
        actor_user_id: context.auth.user.id,
        action: 'supplier_archived',
        entity_type: 'supplier',
        entity_id: id,
      });
      if (!result.data) {
        sendJson(
          response,
          404,
          { error: { code: 'NOT_FOUND', message: 'Supplier not found.' } },
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
      return;
    }
    if (request.method === 'POST') {
      const result = await context.client
        .from('suppliers')
        .update({ is_active: false, updated_by: context.auth.user.id })
        .eq('organization_id', context.organization.id)
        .eq('id', id)
        .select('id, name, is_active')
        .maybeSingle();
      if (result.error) throw result.error;
      sendJson(
        response,
        200,
        { data: result.data, requestId: getRequestId(request) },
        getRequestId(request),
      );
      return;
    }
    const input = schema.parse(await readJson(request));
    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.contactPerson !== undefined) changes.contact_person = input.contactPerson || null;
    if (input.phone !== undefined) changes.phone = phone(input.phone);
    if (input.alternativePhone !== undefined)
      changes.alternative_phone = input.alternativePhone ? phone(input.alternativePhone) : null;
    if (input.email !== undefined) changes.email = input.email || null;
    if (input.address !== undefined) changes.address = input.address || null;
    if (input.city !== undefined) changes.city = input.city || null;
    if (input.website !== undefined) changes.website = input.website || null;
    if (input.referenceCode !== undefined) changes.reference_code = input.referenceCode || null;
    if (input.notes !== undefined) changes.notes = input.notes || null;
    if (input.isActive !== undefined) changes.is_active = input.isActive;
    changes.updated_by = context.auth.user.id;
    const result = await context.client
      .from('suppliers')
      .update(changes)
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .select('id, name, reference_code, is_active, updated_at')
      .maybeSingle();
    if (result.error) throw result.error;
    await context.client.from('audit_logs').insert({
      organization_id: context.organization.id,
      actor_user_id: context.auth.user.id,
      action: input.isActive === false ? 'supplier_archived' : 'supplier_updated',
      entity_type: 'supplier',
      entity_id: id,
    });
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
