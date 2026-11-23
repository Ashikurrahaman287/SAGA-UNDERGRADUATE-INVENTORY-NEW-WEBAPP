import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { permissions } from '../../../src/lib/permissions/permission-registry';
const schema = z.object({ note: z.string().trim().min(1).max(5000) }).strict();
export default async function notes(
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
      .from('customer_notes')
      .insert({
        organization_id: context.organization.id,
        customer_id: customerId,
        note: input.note,
        author_user_id: context.auth.user.id,
      })
      .select('id, note, author_user_id, created_at')
      .single();
    if (result.error) throw result.error;
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
