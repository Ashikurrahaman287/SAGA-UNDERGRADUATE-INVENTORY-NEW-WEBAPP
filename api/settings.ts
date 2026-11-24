import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from './lib/request-id';
import { sendError, sendJson } from './lib/response';
import { getSupabaseServerClient } from './lib/supabase';
import { requirePermission } from './lib/auth/authorization-context';
import { readJson, sendAuthFailure } from './lib/auth/http';
import { requireCsrf, requireSameOrigin } from './lib/auth/security';
import { permissions } from '../src/lib/permissions/permission-registry';
import { organizationSettingsSchema } from '../src/features/settings/settings-validation';

const updateSchema = organizationSettingsSchema.extend({
  lowStockThreshold: z.number().int().min(0).max(100000000),
});

export default async function settings(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'PATCH') {
    response.setHeader('Allow', 'GET, PATCH');
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', getRequestId(request));
    return;
  }
  try {
    if (request.method === 'PATCH') {
      requireSameOrigin(request);
      requireCsrf(request);
    }
    const context = await requirePermission(
      request,
      response,
      request.method === 'GET' ? permissions.settingsView : permissions.settingsManage,
    );
    if (!context) return;
    const admin = getSupabaseServerClient();

    if (request.method === 'GET') {
      const [
        { data: organization, error: organizationError },
        { data: business, error: businessError },
      ] = await Promise.all([
        admin
          .from('organizations')
          .select('name, business_email, business_phone, business_address, currency, timezone')
          .eq('id', context.organization.id)
          .single(),
        admin
          .from('business_settings')
          .select(
            'low_stock_threshold, receipt_prefix, receipt_header, receipt_footer, receipt_notes, notification_preferences, moderator_returns_enabled',
          )
          .eq('organization_id', context.organization.id)
          .maybeSingle(),
      ]);
      if (organizationError) throw organizationError;
      if (businessError) throw businessError;
      sendJson(
        response,
        200,
        {
          data: {
            name: organization.name,
            businessEmail: organization.business_email || '',
            businessPhone: organization.business_phone || '',
            businessAddress: organization.business_address || '',
            currency: organization.currency,
            timezone: organization.timezone,
            lowStockThreshold: business?.low_stock_threshold ?? 0,
            receiptPrefix: business?.receipt_prefix || 'SAGA',
            receiptHeader: business?.receipt_header || '',
            receiptFooter: business?.receipt_footer || '',
            receiptNotes: business?.receipt_notes || '',
            notificationPreferences: {
              lowStock: business?.notification_preferences?.lowStock === true,
              sales: business?.notification_preferences?.sales === true,
              deliveries: business?.notification_preferences?.deliveries === true,
              returns: business?.notification_preferences?.returns === true,
            },
            moderatorReturnsEnabled: business?.moderator_returns_enabled ?? false,
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }

    const input = updateSchema.parse(await readJson(request));
    const { data, error } = await admin.rpc('admin_update_organization_settings', {
      p_organization_id: context.organization.id,
      p_actor_user_id: context.auth.user.id,
      p_settings: input,
      p_request_id: getRequestId(request),
    });
    if (error) {
      if (
        /invalid business timezone|invalid currency|invalid low-stock threshold|invalid receipt prefix/i.test(
          error.message,
        )
      ) {
        sendError(
          response,
          400,
          'INVALID_SETTINGS',
          'One or more settings are invalid.',
          getRequestId(request),
        );
        return;
      }
      throw error;
    }
    sendJson(response, 200, { data, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
