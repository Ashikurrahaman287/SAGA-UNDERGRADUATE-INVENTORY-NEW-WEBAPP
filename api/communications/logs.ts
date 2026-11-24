import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

export default async function communicationLogs(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.communicationsManage);
    if (!context) return;
    const input = z
      .object({
        channel: z.enum(['sms', 'email']).optional(),
        status: z.enum(['queued', 'sent', 'delivered', 'failed', 'rejected_consent']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse({
        channel: typeof request.query.channel === 'string' ? request.query.channel : undefined,
        status: typeof request.query.status === 'string' ? request.query.status : undefined,
        page: typeof request.query.page === 'string' ? request.query.page : undefined,
        pageSize: typeof request.query.pageSize === 'string' ? request.query.pageSize : undefined,
      });
    let query = context.client
      .from('communication_logs')
      .select(
        'id, channel, label, template_type, recipient, provider_reference, delivery_status, provider_error_code, provider_message_id, created_at, sent_at, triggered_by',
        { count: 'exact' },
      )
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: false })
      .range((input.page - 1) * input.pageSize, input.page * input.pageSize - 1);
    if (input.channel) query = query.eq('channel', input.channel);
    if (input.status) query = query.eq('delivery_status', input.status);
    const result = await query;
    if (result.error) throw result.error;
    sendJson(
      response,
      200,
      {
        data: result.data || [],
        total: result.count || 0,
        page: input.page,
        pageSize: input.pageSize,
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
