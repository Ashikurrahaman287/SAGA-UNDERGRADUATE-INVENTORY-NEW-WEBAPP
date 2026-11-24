import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security';
import { permissions } from '../../src/lib/permissions/permission-registry';
import { normalizeBangladeshPhone, sendSwiftSms } from '../_lib/swiftsms';

const schema = z
  .object({
    channel: z.enum(['sms', 'email']),
    label: z.enum(['transactional', 'promotional']),
    templateType: z.enum(['receipt', 'delivery_reminder', 'cancellation', 'campaign']),
    recipients: z
      .array(
        z
          .object({
            customerId: z.string().uuid().optional(),
            phone: z.string().trim().optional(),
            email: z.string().trim().email().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    message: z.string().trim().min(1).max(5000),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();

export default async function communicationsSend(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.communicationsSend);
    if (!context) return;
    const input = schema.parse(await readJson(request));

    if (input.channel === 'email') {
      sendJson(
        response,
        501,
        {
          error: {
            code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
            message: 'Email provider dispatch is not configured.',
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }

    const normalizedRecipients: string[] = [];
    for (const recipient of input.recipients) {
      const normalized = normalizeBangladeshPhone(recipient.phone || '');
      if (!normalized) continue;
      let consentGranted = true;
      if (recipient.customerId) {
        const consent = await context.client
          .from('communication_consents')
          .select('consent_status')
          .eq('organization_id', context.organization.id)
          .eq('customer_id', recipient.customerId)
          .eq('channel', 'sms')
          .maybeSingle();
        if (consent.error) throw consent.error;
        consentGranted = consent.data?.consent_status === 'granted';
      }
      if (consentGranted) {
        normalizedRecipients.push(normalized);
      } else {
        const rejected = await context.client.rpc('reserve_communication_send', {
          p_organization_id: context.organization.id,
          p_idempotency_key: input.idempotencyKey,
          p_channel: 'sms',
          p_label: input.label,
          p_template_type: input.templateType,
          p_recipient: normalized,
          p_customer_id: recipient.customerId || null,
          p_related_entity_type: null,
          p_related_entity_id: null,
        });
        if (!rejected.error && rejected.data) {
          await context.client.rpc('complete_communication_send', {
            p_organization_id: context.organization.id,
            p_log_id: rejected.data,
            p_status: 'rejected_consent',
            p_provider_error_code: null,
            p_provider_message_id: null,
            p_provider_response: { reason: 'recipient consent not granted' },
          });
        }
      }
    }
    if (!normalizedRecipients.length) {
      sendJson(
        response,
        400,
        {
          error: {
            code: 'INVALID_RECIPIENT',
            message: 'No valid Bangladeshi SMS recipients were provided.',
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }

    const rateLimit = await context.client.rpc('consume_auth_rate_limit', {
      p_rate_key: `communication:${context.organization.id}:${context.auth.user.id}`,
      p_limit: 20,
      p_window_seconds: 3600,
    });
    if (rateLimit.error) throw rateLimit.error;
    const allowed = rateLimit.data?.[0]?.allowed;
    if (allowed === false) {
      sendJson(
        response,
        429,
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Communication sending is temporarily rate limited.',
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }

    const result = await sendSwiftSms({
      recipients: normalizedRecipients,
      message: input.message,
      label: input.label,
    });
    for (const recipient of normalizedRecipients) {
      const recipientInput = input.recipients.find(
        (item) => normalizeBangladeshPhone(item.phone || '') === recipient,
      );
      const reserved = await context.client.rpc('reserve_communication_send', {
        p_organization_id: context.organization.id,
        p_idempotency_key: input.idempotencyKey,
        p_channel: 'sms',
        p_label: input.label,
        p_template_type: input.templateType,
        p_recipient: recipient,
        p_customer_id: recipientInput?.customerId || null,
        p_related_entity_type: null,
        p_related_entity_id: null,
      });
      if (reserved.error) throw reserved.error;
      await context.client.rpc('complete_communication_send', {
        p_organization_id: context.organization.id,
        p_log_id: reserved.data,
        p_status: result.status,
        p_provider_error_code: result.providerErrorCode,
        p_provider_message_id: result.providerMessageId,
        p_provider_response: {
          redacted: true,
          redactedUrl: result.redactedUrl,
          providerMessage: result.providerMessage,
        },
      });
    }

    sendJson(
      response,
      result.status === 'sent' ? 200 : 502,
      {
        data: {
          status: result.status,
          recipients: normalizedRecipients,
          providerErrorCode: result.providerErrorCode,
          retryable: result.retryable,
        },
        requestId: getRequestId(request),
      },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
