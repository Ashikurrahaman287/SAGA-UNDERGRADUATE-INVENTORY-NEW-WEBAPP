import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) => value.toUpperCase())
      .optional(),
    description: z.string().trim().max(5000).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    costPrice: z.coerce.number().finite().min(0).optional(),
    sellingPrice: z.coerce.number().finite().min(0).optional(),
    lowStockThreshold: z.coerce.number().finite().min(0).optional(),
    unit: z.string().trim().min(1).max(40).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
function productId(request: VercelRequest): string {
  return z.string().uuid().parse(request.query.id);
}

export default async function product(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!['GET', 'PATCH', 'POST'].includes(request.method || '')) {
    response.setHeader('Allow', 'GET, PATCH, POST');
    sendJson(
      response,
      405,
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
      getRequestId(request),
    );
    return;
  }
  try {
    const id = productId(request);
    if (request.method === 'GET') {
      const context = await requirePermission(request, response, permissions.productsView);
      if (!context) return;
      const result = await context.client
        .from('products')
        .select(
          'id, organization_id, name, sku, description, category_id, supplier_id, cost_price, selling_price, quantity, low_stock_threshold, unit, is_active, created_at, updated_at, categories(id, name), suppliers(id, name)',
        )
        .eq('organization_id', context.organization.id)
        .eq('id', id)
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        sendJson(
          response,
          404,
          { error: { code: 'NOT_FOUND', message: 'Product not found.' } },
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
      return;
    }
    if (request.method === 'PATCH') {
      const context = await requirePermission(request, response, permissions.productsUpdate);
      if (!context) return;
      const input = updateSchema.parse(await readJson(request));
      if (input.supplierId && context.organization.role !== 'admin') {
        sendJson(
          response,
          403,
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Supplier relationships require administrator access.',
            },
          },
          getRequestId(request),
        );
        return;
      }
      const changes: Record<string, unknown> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.sku !== undefined) changes.sku = input.sku;
      if (input.description !== undefined) changes.description = input.description;
      if (input.categoryId !== undefined) changes.category_id = input.categoryId;
      if (input.supplierId !== undefined) changes.supplier_id = input.supplierId;
      if (input.costPrice !== undefined) changes.cost_price = input.costPrice;
      if (input.sellingPrice !== undefined) changes.selling_price = input.sellingPrice;
      if (input.lowStockThreshold !== undefined)
        changes.low_stock_threshold = input.lowStockThreshold;
      if (input.unit !== undefined) changes.unit = input.unit;
      if (input.isActive !== undefined) changes.is_active = input.isActive;
      const result = await context.client
        .from('products')
        .update(changes)
        .eq('organization_id', context.organization.id)
        .eq('id', id)
        .select(
          'id, name, sku, description, category_id, supplier_id, cost_price, selling_price, quantity, low_stock_threshold, unit, is_active, created_at, updated_at',
        )
        .maybeSingle();
      if (result.error) {
        const status = result.error.code === '23505' ? 409 : 400;
        sendJson(
          response,
          status,
          {
            error: {
              code: status === 409 ? 'DUPLICATE_SKU' : 'PRODUCT_UPDATE_FAILED',
              message:
                status === 409
                  ? 'That SKU is already in use.'
                  : 'The product could not be updated.',
            },
          },
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
      return;
    }
    const context = await requirePermission(request, response, permissions.productsArchive);
    if (!context) return;
    const result = await context.client.rpc('archive_product', {
      p_organization_id: context.organization.id,
      p_product_id: id,
    });
    if (result.error) {
      sendJson(
        response,
        409,
        {
          error: {
            code: 'PRODUCT_ARCHIVE_BLOCKED',
            message:
              'The product could not be archived while it has available stock or active references.',
          },
        },
        getRequestId(request),
      );
      return;
    }
    sendJson(
      response,
      200,
      { data: { archived: true }, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
