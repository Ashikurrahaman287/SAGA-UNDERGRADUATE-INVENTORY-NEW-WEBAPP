import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';
const schema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    referenceCode: z.string().trim().max(80).optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    address: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(5000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export default async function seller(
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
    const context = await requirePermission(request, response, permissions.sellersManage);
    if (!context) return;
    const id = z.string().uuid().parse(request.query.id);
    if (request.method === 'GET') {
      const result = await context.client
        .from('sellers')
        .select(
          'id, name, reference_code, phone, email, address, notes, is_active, created_at, updated_at',
        )
        .eq('organization_id', context.organization.id)
        .eq('id', id)
        .maybeSingle();
      if (result.error) throw result.error;
      await context.client.from('audit_logs').insert({
        organization_id: context.organization.id,
        actor_user_id: context.auth.user.id,
        action: 'seller_archived',
        entity_type: 'seller',
        entity_id: id,
      });
      if (!result.data) {
        sendJson(
          response,
          404,
          { error: { code: 'NOT_FOUND', message: 'Seller not found.' } },
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
        .from('sellers')
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
    if (input.referenceCode !== undefined) changes.reference_code = input.referenceCode || null;
    if (input.phone !== undefined) changes.phone = input.phone || null;
    if (input.email !== undefined) changes.email = input.email || null;
    if (input.address !== undefined) changes.address = input.address || null;
    if (input.notes !== undefined) changes.notes = input.notes || null;
    if (input.isActive !== undefined) changes.is_active = input.isActive;
    changes.updated_by = context.auth.user.id;
    const result = await context.client
      .from('sellers')
      .update(changes)
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .select('id, name, reference_code, is_active, updated_at')
      .maybeSingle();
    if (result.error) throw result.error;
    await context.client.from('audit_logs').insert({
      organization_id: context.organization.id,
      actor_user_id: context.auth.user.id,
      action: input.isActive === false ? 'seller_archived' : 'seller_updated',
      entity_type: 'seller',
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
