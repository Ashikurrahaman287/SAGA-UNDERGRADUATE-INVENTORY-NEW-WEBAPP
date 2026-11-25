import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id.js';
import { sendJson } from '../lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http.js';
import { requirePermission } from '../lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security.js';
import { permissions } from '../../src/lib/permissions/permission-registry.js';
import { salePlacedSms, sendSaleNotification } from '../_lib/notifications.js';

const itemSchema = z
  .object({ productId: z.string().uuid(), quantity: z.number().int().positive() })
  .strict();
const createSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128),
    customerId: z.string().uuid().nullable().optional(),
    sellerId: z.string().uuid().nullable().optional(),
    discountType: z.enum(['fixed', 'percentage']).default('fixed'),
    discountValue: z.coerce.number().finite().min(0).default(0),
    deliveryFee: z.coerce.number().finite().min(0).default(0),
    paymentMethod: z
      .enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'other'])
      .default('cash'),
    amountPaid: z.coerce.number().finite().min(0).default(0),
    packagingCost: z.coerce.number().finite().min(0).default(0),
    paymentReference: z.string().trim().max(200).optional(),
    paymentNote: z.string().trim().max(500).optional(),
    deliveryAddressSnapshot: z
      .object({
        addressLabel: z.string().trim().max(80).optional(),
        addressLine: z.string().trim().min(1).max(300),
        area: z.string().trim().max(160).optional(),
        city: z.string().trim().min(1).max(120),
        postalCode: z.string().trim().max(40).optional(),
        deliveryInstructions: z.string().trim().max(500).optional(),
      })
      .strict()
      .nullable()
      .optional(),
    deliveryScheduledAt: z.string().datetime().optional().nullable(),
    notes: z.string().trim().max(5000).optional(),
    items: z.array(itemSchema).min(1).max(100),
  })
  .strict();

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function sales(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    if (request.method === 'GET') {
      const context = await requirePermission(request, response, permissions.salesView);
      if (!context) return;
      const querySchema = z.object({
        search: z.string().trim().max(100).optional(),
        customerId: z.string().uuid().optional(),
        sellerId: z.string().uuid().optional(),
        paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'refunded', 'voided']).optional(),
        fulfillmentStatus: z
          .enum([
            'pending',
            'processing',
            'packed',
            'ready_for_delivery',
            'out_for_delivery',
            'delivered',
            'cancelled',
          ])
          .optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        sort: z
          .enum([
            'created_at',
            'receipt_number',
            'total_amount',
            'amount_paid',
            'amount_due',
            'customer_name',
            'payment_status',
          ])
          .default('created_at'),
        direction: z.enum(['asc', 'desc']).default('desc'),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      });
      const input = querySchema.parse({
        search: queryValue(request.query.search),
        customerId: queryValue(request.query.customerId),
        sellerId: queryValue(request.query.sellerId),
        paymentStatus: queryValue(request.query.paymentStatus),
        fulfillmentStatus: queryValue(request.query.fulfillmentStatus),
        from: queryValue(request.query.from),
        to: queryValue(request.query.to),
        sort: queryValue(request.query.sort),
        direction: queryValue(request.query.direction),
        page: queryValue(request.query.page),
        pageSize: queryValue(request.query.pageSize),
      });

      const organization = await context.client
        .from('organizations')
        .select('timezone')
        .eq('id', context.organization.id)
        .maybeSingle();
      if (organization.error) throw organization.error;
      const timezone = organization.data?.timezone || 'UTC';
      const { buildDashboardDateRange } = await import('../lib/dashboard/date-range.js');
      const range =
        input.from || input.to
          ? buildDashboardDateRange(input.from, input.to, timezone)
          : { start: null, end: null };

      const [history, summary] = await Promise.all([
        context.client.rpc('list_sales_history', {
          p_organization_id: context.organization.id,
          p_search: input.search || null,
          p_customer_id: input.customerId || null,
          p_seller_id: input.sellerId || null,
          p_payment_status: input.paymentStatus || null,
          p_fulfillment_status: input.fulfillmentStatus || null,
          p_from: range.start?.toISOString() || null,
          p_to: range.end?.toISOString() || null,
          p_sort: input.sort,
          p_ascending: input.direction === 'asc',
          p_limit: input.pageSize,
          p_offset: (input.page - 1) * input.pageSize,
        }),
        context.client.rpc('get_sales_history_summary', {
          p_organization_id: context.organization.id,
          p_customer_id: input.customerId || null,
          p_seller_id: input.sellerId || null,
          p_payment_status: input.paymentStatus || null,
          p_fulfillment_status: input.fulfillmentStatus || null,
          p_from: range.start?.toISOString() || null,
          p_to: range.end?.toISOString() || null,
        }),
      ]);
      if (history.error) throw history.error;
      if (summary.error) throw summary.error;
      sendJson(
        response,
        200,
        {
          data: history.data?.items || [],
          total: history.data?.total || 0,
          summary: summary.data || null,
          page: input.page,
          pageSize: input.pageSize,
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }

    requireSameOrigin(request);
    requireCsrf(request);
    const context = await requirePermission(request, response, permissions.salesCreate);
    if (!context) return;
    const input = createSchema.parse(await readJson(request));
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          customerId: input.customerId,
          sellerId: input.sellerId,
          discountType: input.discountType,
          discountValue: input.discountValue,
          deliveryFee: input.deliveryFee,
          paymentMethod: input.paymentMethod,
          amountPaid: input.amountPaid,
          packagingCost: input.packagingCost,
          paymentReference: input.paymentReference,
          paymentNote: input.paymentNote,
          deliveryAddressSnapshot: input.deliveryAddressSnapshot,
          deliveryScheduledAt: input.deliveryScheduledAt,
          notes: input.notes,
          items: input.items,
        }),
      )
      .digest('hex');

    const rpc = await context.client.rpc('create_sale_transaction', {
      p_organization_id: context.organization.id,
      p_request_hash: requestHash,
      p_idempotency_key: input.idempotencyKey,
      p_customer_id: input.customerId || null,
      p_seller_id: input.sellerId || null,
      p_discount_type: input.discountType,
      p_discount_value: input.discountValue,
      p_delivery_fee: input.deliveryFee,
      p_payment_method: input.paymentMethod,
      p_amount_paid: input.amountPaid,
      p_payment_reference: input.paymentReference || null,
      p_payment_note: input.paymentNote || null,
      p_delivery_address_snapshot: input.deliveryAddressSnapshot
        ? {
            address_line: input.deliveryAddressSnapshot.addressLine,
            city: input.deliveryAddressSnapshot.city,
            area: input.deliveryAddressSnapshot.area || null,
            postal_code: input.deliveryAddressSnapshot.postalCode || null,
            delivery_instructions: input.deliveryAddressSnapshot.deliveryInstructions || null,
          }
        : null,
      p_delivery_scheduled_at: input.deliveryScheduledAt || null,
      p_notes: input.notes || null,
      p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
      p_request_id: context.requestId,
      p_packaging_cost: input.packagingCost,
    });
    if (rpc.error) {
      const message = rpc.error.message || '';
      const insufficient = message.includes('Insufficient stock');
      const inactive = message.includes('Inactive product');
      const duplicateIdempotency = message.includes('Idempotency key was used');
      sendJson(
        response,
        insufficient ? 409 : duplicateIdempotency ? 409 : 400,
        {
          error: {
            code: insufficient
              ? 'INSUFFICIENT_STOCK'
              : duplicateIdempotency
                ? 'IDEMPOTENCY_PAYLOAD_MISMATCH'
                : inactive
                  ? 'INACTIVE_PRODUCT'
                  : 'SALE_CREATE_FAILED',
            message: insufficient
              ? 'One or more products do not have enough available stock.'
              : duplicateIdempotency
                ? 'This submission key was used with different sale details.'
                : inactive
                  ? 'An inactive product cannot be sold.'
                  : 'The sale could not be created.',
          },
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }
    const saleData = rpc.data as Record<string, unknown>;
    if (input.customerId) {
      const customer = await context.client
        .from('customers')
        .select('name,phone')
        .eq('organization_id', context.organization.id)
        .eq('id', input.customerId)
        .maybeSingle();
      if (!customer.error && customer.data) {
        await sendSaleNotification(
          {
            customerName: customer.data.name,
            phone: customer.data.phone,
            receiptNumber: String(saleData.receipt_number || ''),
            totalAmount: Number(saleData.total_amount || 0),
          },
          salePlacedSms({
            customerName: customer.data.name,
            phone: customer.data.phone,
            receiptNumber: String(saleData.receipt_number || ''),
            totalAmount: Number(saleData.total_amount || 0),
          }),
        ).catch(() => undefined);
      }
    }
    sendJson(
      response,
      201,
      { data: rpc.data, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
