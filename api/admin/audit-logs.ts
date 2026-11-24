import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendError, sendJson } from '../lib/response';
import { getSupabaseServerClient } from '../lib/supabase';
import { requirePermission } from '../lib/auth/authorization-context';
import { methodNotAllowed, sendAuthFailure } from '../lib/auth/http';
import { permissions } from '../../src/lib/permissions/permission-registry';
import { zonedMidnightUtc } from '../lib/dashboard/date-range';
import { sanitizeAuditValue } from '../../src/features/settings/audit-safety';

const categories = [
  'auth',
  'role_change',
  'product_stock',
  'sale',
  'payment',
  'delivery',
  'return',
  'settings',
  'communication',
] as const;

type AuditRow = {
  before_data: unknown;
  after_data: unknown;
  total_count: number | string;
  [key: string]: unknown;
};

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(200).optional(),
    category: z.enum(categories).optional(),
    actorId: z.string().uuid().optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'Date range is invalid.',
  });

function valueOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export default async function auditLogs(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  const requestId = getRequestId(request);
  try {
    const context = await requirePermission(request, response, permissions.auditLogsView);
    if (!context) return;
    const input = querySchema.parse({
      page: valueOf(request.query.page as string | string[] | undefined),
      pageSize: valueOf(request.query.pageSize as string | string[] | undefined),
      search: valueOf(request.query.search as string | string[] | undefined),
      category: valueOf(request.query.category as string | string[] | undefined),
      actorId: valueOf(request.query.actorId as string | string[] | undefined),
      from: valueOf(request.query.from as string | string[] | undefined),
      to: valueOf(request.query.to as string | string[] | undefined),
    });
    if ((input.from && !input.to) || (!input.from && input.to)) {
      sendError(
        response,
        400,
        'INVALID_DATE_RANGE',
        'Provide both date range boundaries.',
        requestId,
      );
      return;
    }
    const admin = getSupabaseServerClient();
    const { data: organization, error: organizationError } = await admin
      .from('organizations')
      .select('timezone')
      .eq('id', context.organization.id)
      .single();
    if (organizationError) throw organizationError;
    const from = input.from
      ? zonedMidnightUtc(input.from, organization.timezone).toISOString()
      : null;
    const to = input.to
      ? zonedMidnightUtc(nextDate(input.to), organization.timezone).toISOString()
      : null;
    const { data, error } = await admin.rpc('list_admin_audit_logs', {
      p_organization_id: context.organization.id,
      p_search: input.search || null,
      p_category: input.category || null,
      p_actor_user_id: input.actorId || null,
      p_from: from,
      p_to: to,
      p_limit: input.pageSize,
      p_offset: (input.page - 1) * input.pageSize,
    });
    if (error) throw error;
    const rows = (data || []) as AuditRow[];
    sendJson(
      response,
      200,
      {
        data: rows.map((row) => ({
          ...row,
          before_data: sanitizeAuditValue(row.before_data),
          after_data: sanitizeAuditValue(row.after_data),
        })),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: Number(rows[0]?.total_count || 0),
        },
        timezone: organization.timezone,
        requestId,
      },
      requestId,
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
