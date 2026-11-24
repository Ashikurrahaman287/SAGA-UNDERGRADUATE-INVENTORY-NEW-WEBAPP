import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { readJson, sendAuthFailure, methodNotAllowed } from '../lib/auth/http';
import { requirePermission } from '../lib/auth/authorization-context';
import { permissions } from '../../src/lib/permissions/permission-registry';
import { getSupabaseServerClient } from '../lib/supabase';

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
  stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  sort: z.enum(['name', 'sku', 'cost_price', 'selling_price', 'quantity']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(5000).optional().default(''),
  categoryId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  costPrice: z.coerce.number().finite().min(0),
  sellingPrice: z.coerce.number().finite().min(0),
  initialStock: z.coerce.number().finite().min(0).default(0),
  lowStockThreshold: z.coerce.number().finite().min(0).default(0),
  unit: z.string().trim().min(1).max(40).default('unit'),
  isActive: z.boolean().default(true),
  openingStockReason: z.string().trim().max(500).optional().default(''),
});
function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function products(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    const permission =
      request.method === 'GET' ? permissions.productsView : permissions.productsCreate;
    const context = await requirePermission(request, response, permission);
    if (!context) return;
    if (request.method === 'GET') {
      const input = listSchema.parse({
        search: queryValue(request.query.search),
        categoryId: queryValue(request.query.categoryId),
        supplierId: queryValue(request.query.supplierId),
        active: queryValue(request.query.active),
        stockStatus: queryValue(request.query.stockStatus),
        sort: queryValue(request.query.sort),
        direction: queryValue(request.query.direction),
        page: queryValue(request.query.page),
        pageSize: queryValue(request.query.pageSize),
      });
      const result = await context.client.rpc('list_products', {
        p_organization_id: context.organization.id,
        p_search: input.search || null,
        p_category_id: input.categoryId || null,
        p_supplier_id: input.supplierId || null,
        p_active: input.active === 'all' ? null : input.active === 'true',
        p_stock_status: input.stockStatus || null,
        p_sort: input.sort,
        p_ascending: input.direction === 'asc',
        p_limit: input.pageSize,
        p_offset: (input.page - 1) * input.pageSize,
      });
      if (result.error) throw result.error;
      const { data: settings, error: settingsError } = await getSupabaseServerClient()
        .from('business_settings')
        .select('low_stock_threshold')
        .eq('organization_id', context.organization.id)
        .maybeSingle();
      if (settingsError) throw settingsError;
      sendJson(
        response,
        200,
        {
          data: result.data || { items: [], total: 0 },
          defaultLowStockThreshold: settings?.low_stock_threshold ?? 0,
          page: input.page,
          pageSize: input.pageSize,
          requestId: getRequestId(request),
        },
        getRequestId(request),
      );
      return;
    }
    const input = createSchema.parse(await readJson(request));
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
    if (input.initialStock > 0 && !input.openingStockReason) {
      sendJson(
        response,
        400,
        {
          error: {
            code: 'OPENING_STOCK_REASON_REQUIRED',
            message: 'Opening stock requires a reason.',
          },
        },
        getRequestId(request),
      );
      return;
    }
    const result = await context.client.rpc('create_product_with_opening_stock', {
      p_organization_id: context.organization.id,
      p_name: input.name,
      p_sku: input.sku,
      p_description: input.description,
      p_category_id: input.categoryId || null,
      p_supplier_id: input.supplierId || null,
      p_cost_price: input.costPrice,
      p_selling_price: input.sellingPrice,
      p_initial_stock: input.initialStock,
      p_low_stock_threshold: input.lowStockThreshold,
      p_unit: input.unit,
      p_is_active: input.isActive,
      p_reason: input.openingStockReason,
    });
    if (result.error) {
      const status = result.error.code === '23505' ? 409 : 400;
      sendJson(
        response,
        status,
        {
          error: {
            code: status === 409 ? 'DUPLICATE_SKU' : 'PRODUCT_CREATE_FAILED',
            message:
              status === 409 ? 'That SKU is already in use.' : 'The product could not be created.',
          },
        },
        getRequestId(request),
      );
      return;
    }
    sendJson(
      response,
      201,
      { data: { id: result.data }, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
