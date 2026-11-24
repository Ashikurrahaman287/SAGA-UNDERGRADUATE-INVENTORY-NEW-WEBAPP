import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';
const schema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export default async function category(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'PATCH')) return;
  try {
    const context = await requirePermission(request, response, permissions.categoriesManage);
    if (!context) return;
    const id = z.string().uuid().parse(request.query.id);
    const input = schema.parse(await readJson(request));
    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined) changes.description = input.description;
    if (input.isActive !== undefined) changes.is_active = input.isActive;
    const result = await context.client
      .from('categories')
      .update(changes)
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .select('id, name, description, is_active, created_at, updated_at')
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Category not found.' } },
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
