import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';
const schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    referenceCode: z.string().trim().max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s().-]{7,20}$/)
      .optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    address: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict();
export default async function sellers(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    const context = await requirePermission(
      request,
      response,
      request.method === 'GET' ? permissions.sellersView : permissions.sellersManage,
    );
    if (!context) return;
    if (request.method === 'GET') {
      const result = await context.client.rpc('list_sellers', {
        p_organization_id: context.organization.id,
        p_search: typeof request.query.search === 'string' ? request.query.search : null,
        p_active: request.query.active === 'all' ? null : request.query.active !== 'false',
        p_limit: 100,
        p_offset: 0,
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
      .from('sellers')
      .insert({
        organization_id: context.organization.id,
        name: input.name,
        reference_code: input.referenceCode || null,
        phone: input.phone || null,
        email: input.email || null,
        address: input.address || null,
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
            code: status === 409 ? 'DUPLICATE_REFERENCE' : 'SELLER_CREATE_FAILED',
            message:
              status === 409
                ? 'That seller reference code is already in use.'
                : 'The seller could not be created.',
          },
        },
        getRequestId(request),
      );
      return;
    }
    await context.client.from('audit_logs').insert({
      organization_id: context.organization.id,
      actor_user_id: context.auth.user.id,
      action: 'seller_created',
      entity_type: 'seller',
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
