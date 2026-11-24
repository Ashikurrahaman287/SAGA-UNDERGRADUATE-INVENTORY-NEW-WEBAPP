import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security';
import { permissions } from '../../src/lib/permissions/permission-registry';

const putSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    subject: z.string().trim().max(500).optional(),
    content: z.string().trim().min(1).max(10000),
    isActive: z.boolean().default(true),
  })
  .strict();

export default async function templates(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'PUT')) return;
  try {
    if (request.method === 'GET') {
      const context = await requirePermission(request, response, permissions.communicationsView);
      if (!context) return;
      const result = await context.client
        .from('communication_templates')
        .select('id, template_type, channel, label, name, subject, content, is_active, updated_at')
        .eq('organization_id', context.organization.id)
        .order('template_type', { ascending: true });
      if (result.error) throw result.error;
      sendJson(
        response,
        200,
        { data: result.data || [], requestId: getRequestId(request) },
        getRequestId(request),
      );
      return;
    }
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.communicationsManage);
    if (!context) return;
    const id = z.string().uuid().parse(request.query.id);
    const input = putSchema.parse(await readJson(request));
    const result = await context.client
      .from('communication_templates')
      .update({
        name: input.name,
        subject: input.subject || null,
        content: input.content,
        is_active: input.isActive,
        updated_by: context.auth.user.id,
      })
      .eq('organization_id', context.organization.id)
      .eq('id', id)
      .select('id, template_type, channel, label, name, subject, content, is_active, updated_at')
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(
        response,
        404,
        { error: { code: 'NOT_FOUND', message: 'Template not found.' } },
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
