import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';
import { buildDashboardDateRange } from '../lib/dashboard/date-range';

const querySchema = z.object({ from: z.string().optional(), to: z.string().optional() });

export default async function dashboardSummary(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  const requestId = getRequestId(request);
  try {
    const context = await requirePermission(request, response, permissions.dashboardView);
    if (!context) return;
    const { data: organization, error: organizationError } = await context.client
      .from('organizations')
      .select('timezone')
      .eq('id', context.organization.id)
      .maybeSingle();
    if (organizationError || !organization?.timezone)
      throw new Error('Dashboard organization configuration is unavailable.');
    const query = querySchema.parse({
      from: typeof request.query.from === 'string' ? request.query.from : undefined,
      to: typeof request.query.to === 'string' ? request.query.to : undefined,
    });
    const range = buildDashboardDateRange(query.from, query.to, organization.timezone);
    const { data, error } = await context.client.rpc('get_dashboard_summary', {
      p_organization_id: context.organization.id,
      p_start: range.start.toISOString(),
      p_end: range.end.toISOString(),
    });
    if (error) throw error;
    sendJson(response, 200, { data, requestId }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
