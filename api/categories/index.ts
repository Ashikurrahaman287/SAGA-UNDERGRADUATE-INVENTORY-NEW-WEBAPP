import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';
const schema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();
export default async function categories(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    const context = await requirePermission(
      request,
      response,
      request.method === 'GET' ? permissions.productsView : permissions.categoriesManage,
    );
    if (!context) return;
    if (request.method === 'GET') {
      const result = await context.client
        .from('categories')
        .select('id, name, description, is_active, created_at, updated_at')
        .eq('organization_id', context.organization.id)
        .order('name', { ascending: true });
      if (result.error) throw result.error;
      sendJson(
        response,
        200,
        { data: result.data || [], requestId: getRequestId(request) },
        getRequestId(request),
      );
      return;
    }
    const input = schema.parse(await readJson(request));
    const result = await context.client
      .from('categories')
      .insert({
        organization_id: context.organization.id,
        name: input.name,
        description: input.description || null,
      })
      .select('id, name, description, is_active, created_at, updated_at')
      .single();
    if (result.error) {
      const status = result.error.code === '23505' ? 409 : 400;
      sendJson(
        response,
        status,
        {
          error: {
            code: status === 409 ? 'DUPLICATE_CATEGORY' : 'CATEGORY_CREATE_FAILED',
            message:
              status === 409
                ? 'That category already exists.'
                : 'The category could not be created.',
          },
        },
        getRequestId(request),
      );
      return;
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
