import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from './lib/request-id.js';
import { sendJson } from './lib/response.js';
import { readJson, sendAuthFailure, methodNotAllowed } from './lib/auth/http.js';
import { requirePermission } from './lib/auth/authorization-context.js';
import { requireCsrf, requireSameOrigin } from './lib/auth/security.js';
import { permissions } from '../src/lib/permissions/permission-registry.js';

const sectionSchema = z.enum(['payments', 'costs', 'accounting', 'reports', 'crm', 'investments']);

export default async function operations(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (!['GET', 'POST'].includes(request.method || '')) {
    response.setHeader('Allow', 'GET, POST');
    sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, getRequestId(request));
    return;
  }

  try {
    const section = sectionSchema.parse(typeof request.query.section === 'string' ? request.query.section : undefined);
    const permission = section === 'payments' ? permissions.paymentsView
      : section === 'costs' ? permissions.accountingManage
      : section === 'accounting' ? permissions.accountingView
      : section === 'reports' || section === 'investments' ? permissions.reportsView
      : permissions.crmView;
    const context = await requirePermission(request, response, permission);
    if (!context) return;

    if (request.method === 'POST') {
      if (section !== 'costs') {
        sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'This section is read-only.' } }, getRequestId(request));
        return;
      }
      requireSameOrigin(request);
      requireCsrf(request);
      const input = z.object({
        name: z.string().trim().min(1).max(200),
        category: z.string().trim().min(1).max(160),
        amount: z.coerce.number().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().trim().max(5000).optional(),
      }).parse(await readJson(request));

      const categoryResult = await context.client
        .from('expense_categories')
        .upsert({ organization_id: context.organization.id, name: input.category, is_active: true }, { onConflict: 'organization_id,name' })
        .select('id')
        .single();
      if (categoryResult.error) throw categoryResult.error;

      const costResult = await context.client
        .from('operational_costs')
        .insert({
          organization_id: context.organization.id,
          category_id: categoryResult.data.id,
          amount: input.amount,
          description: input.description || input.name,
          expense_date: input.date,
          created_by: context.auth.user.id,
        })
        .select('id,amount,description,expense_date,created_at')
        .single();
      if (costResult.error) throw costResult.error;
      sendJson(response, 201, { data: costResult.data, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    if (section === 'payments') {
      const result = await context.client
        .from('payments')
        .select('id,amount,payment_method,payment_reference,collected_at,status,notes,sale_id,sales(receipt_number,customer_id,customers(name))')
        .eq('organization_id', context.organization.id)
        .order('collected_at', { ascending: false })
        .limit(250);
      if (result.error) throw result.error;
      sendJson(response, 200, { data: result.data || [], requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    if (section === 'costs') {
      const [categories, costs] = await Promise.all([
        context.client.from('expense_categories').select('id,name,is_active').eq('organization_id', context.organization.id).order('name'),
        context.client.from('operational_costs').select('id,amount,description,expense_date,created_at,expense_categories(name)').eq('organization_id', context.organization.id).order('expense_date', { ascending: false }).limit(250),
      ]);
      if (categories.error) throw categories.error;
      if (costs.error) throw costs.error;
      sendJson(response, 200, { data: { categories: categories.data || [], costs: costs.data || [] }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    if (section === 'accounting') {
      const [sales, costs, payments, refunds] = await Promise.all([
        context.client.from('sales').select('total_amount,amount_paid,amount_due,payment_status,fulfillment_status,created_at').eq('organization_id', context.organization.id).neq('fulfillment_status', 'cancelled'),
        context.client.from('operational_costs').select('amount,expense_date').eq('organization_id', context.organization.id),
        context.client.from('payments').select('amount,status').eq('organization_id', context.organization.id).eq('status', 'completed'),
        context.client.from('refunds').select('amount,status').eq('organization_id', context.organization.id).eq('status', 'processed'),
      ]);
      if (sales.error) throw sales.error;
      if (costs.error) throw costs.error;
      if (payments.error) throw payments.error;
      if (refunds.error) throw refunds.error;
      const salesRows = sales.data || [];
      const costRows = costs.data || [];
      const paymentRows = payments.data || [];
      const refundRows = refunds.data || [];
      const revenue = salesRows.reduce((total, row) => total + Number(row.total_amount || 0), 0);
      const collected = paymentRows.reduce((total, row) => total + Number(row.amount || 0), 0);
      const expenses = costRows.reduce((total, row) => total + Number(row.amount || 0), 0);
      const refunded = refundRows.reduce((total, row) => total + Number(row.amount || 0), 0);
      const outstanding = salesRows.reduce((total, row) => total + Number(row.amount_due || 0), 0);
      sendJson(response, 200, { data: { revenue, collected, expenses, refunded, outstanding, net: collected - expenses - refunded, salesCount: salesRows.length }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    if (section === 'reports') {
      const [sales, products, customers] = await Promise.all([
        context.client.from('sales').select('receipt_number,total_amount,amount_paid,amount_due,payment_status,fulfillment_status,created_at').eq('organization_id', context.organization.id).neq('fulfillment_status', 'cancelled').order('created_at', { ascending: false }).limit(250),
        context.client.from('products').select('id,name,sku,quantity,cost_price,selling_price,is_active').eq('organization_id', context.organization.id).eq('is_active', true),
        context.client.from('customers').select('id,name,created_at').eq('organization_id', context.organization.id).eq('is_active', true),
      ]);
      if (sales.error) throw sales.error;
      if (products.error) throw products.error;
      if (customers.error) throw customers.error;
      const inventoryCost = (products.data || []).reduce((total, row) => total + Number(row.quantity || 0) * Number(row.cost_price || 0), 0);
      const inventoryRetail = (products.data || []).reduce((total, row) => total + Number(row.quantity || 0) * Number(row.selling_price || 0), 0);
      sendJson(response, 200, { data: { sales: sales.data || [], products: products.data || [], customerCount: (customers.data || []).length, inventoryCost, inventoryRetail }, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    if (section === 'crm') {
      const [customers, sales] = await Promise.all([
        context.client.from('customers').select('id,name,phone,email,is_active,created_at').eq('organization_id', context.organization.id).order('created_at', { ascending: false }).limit(250),
        context.client.from('sales').select('customer_id,total_amount,amount_paid,created_at').eq('organization_id', context.organization.id).not('customer_id', 'is', null),
      ]);
      if (customers.error) throw customers.error;
      if (sales.error) throw sales.error;
      const activity = new Map<string, { orders: number; value: number }>();
      for (const sale of sales.data || []) {
        if (!sale.customer_id) continue;
        const current = activity.get(sale.customer_id) || { orders: 0, value: 0 };
        current.orders++;
        current.value += Number(sale.total_amount || 0);
        activity.set(sale.customer_id, current);
      }
      const rows = (customers.data || []).map((customer) => ({ ...customer, ...(activity.get(customer.id) || { orders: 0, value: 0 }) }));
      sendJson(response, 200, { data: rows, requestId: getRequestId(request) }, getRequestId(request));
      return;
    }

    const products = await context.client
      .from('products')
      .select('id,name,sku,quantity,cost_price,selling_price,is_active')
      .eq('organization_id', context.organization.id)
      .eq('is_active', true)
      .order('quantity', { ascending: false });
    if (products.error) throw products.error;
    const rows = (products.data || []).map((row) => ({
      ...row,
      units: Number(row.quantity || 0),
      costValue: Number(row.quantity || 0) * Number(row.cost_price || 0),
      retailValue: Number(row.quantity || 0) * Number(row.selling_price || 0),
    }));
    sendJson(response, 200, { data: rows, requestId: getRequestId(request) }, getRequestId(request));
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
