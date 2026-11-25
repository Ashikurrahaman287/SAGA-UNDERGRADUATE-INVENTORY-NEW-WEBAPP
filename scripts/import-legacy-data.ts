import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const organizationId = 'c6779a77-9499-414b-994d-8cf6cee792f1';
const downloadDir = String.raw`C:\Users\ASH\Downloads`;

function load<T>(name: string): T[] {
  const file = path.join(downloadDir, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(value) ? value : [];
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function upsert(table: string, rows: unknown[], onConflict: string) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const result = await supabase
      .from(table)
      .upsert(rows.slice(offset, offset + chunkSize), { onConflict });
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
  }
}

async function main() {
  const org = await supabase
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .maybeSingle();
  if (org.error) throw org.error;
  if (!org.data) throw new Error(`Organization ${organizationId} was not found`);

  const settings = load<{ key: string; value: string }>('settings');
  const settingsMap = Object.fromEntries(settings.map((item) => [item.key, item.value]));

  await supabase
    .from('organizations')
    .update({
      name: clean(settingsMap.businessName) || 'SAGA INVENTORY',
      business_email: clean(settingsMap.businessEmail),
      business_phone: clean(settingsMap.businessPhone),
    })
    .eq('id', organizationId);

  await supabase
    .from('business_settings')
    .upsert({ organization_id: organizationId }, { onConflict: 'organization_id' });

  const suppliers = load<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    created_at?: string;
  }>('suppliers');
  await upsert('suppliers', suppliers.map((row) => ({
    id: row.id,
    organization_id: organizationId,
    name: row.name,
    phone: clean(row.phone),
    email: clean(row.email),
    is_active: true,
    created_at: date(row.created_at) || new Date().toISOString(),
  })), 'organization_id,id');

  const sellers = load<{
    id: string;
    name: string;
    email?: string;
    created_at?: string;
  }>('sellers');
  await upsert('sellers', sellers.map((row) => ({
    id: row.id,
    organization_id: organizationId,
    name: row.name,
    email: clean(row.email),
    is_active: true,
    created_at: date(row.created_at) || new Date().toISOString(),
  })), 'organization_id,id');

  const customers = load<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    created_at?: string;
  }>('customers');
  await upsert('customers', customers.map((row) => ({
    id: row.id,
    organization_id: organizationId,
    name: row.name,
    phone: clean(row.phone),
    email: clean(row.email),
    is_active: true,
    created_at: date(row.created_at) || new Date().toISOString(),
  })), 'organization_id,id');

  const sourceProducts = load<{
    id: string;
    stock_code: string;
    name: string;
    category: string;
    buying_price: string;
    selling_price: string;
    quantity: number;
    supplier_id?: string;
    created_at?: string;
  }>('products');

  const categoryNames = [...new Set(sourceProducts.map((row) => clean(row.category) || 'Uncategorized'))];
  await upsert('categories', categoryNames.map((name) => ({
    organization_id: organizationId,
    name,
    is_active: true,
  })), 'organization_id,name');

  const categoryResult = await supabase
    .from('categories')
    .select('id,name')
    .eq('organization_id', organizationId);
  if (categoryResult.error) throw categoryResult.error;
  const categoryIds = new Map((categoryResult.data || []).map((row) => [row.name, row.id]));

  await upsert('products', sourceProducts.map((row) => ({
    id: row.id,
    organization_id: organizationId,
    category_id: categoryIds.get(clean(row.category) || 'Uncategorized') || null,
    supplier_id: row.supplier_id && suppliers.some((supplier) => supplier.id === row.supplier_id)
      ? row.supplier_id
      : null,
    name: row.name,
    sku: row.stock_code,
    cost_price: number(row.buying_price),
    selling_price: number(row.selling_price),
    quantity: number(row.quantity),
    low_stock_threshold: 0,
    unit: 'unit',
    is_active: true,
    created_at: date(row.created_at) || new Date().toISOString(),
  })), 'organization_id,id');

  const costNames = [...new Set(load<{ category: string }>('operational_costs').map((row) => clean(row.category) || 'Miscellaneous'))];
  await upsert('expense_categories', costNames.map((name) => ({
    organization_id: organizationId,
    name,
    is_active: true,
  })), 'organization_id,name');

  const categoryResultForCosts = await supabase
    .from('expense_categories')
    .select('id,name')
    .eq('organization_id', organizationId);
  if (categoryResultForCosts.error) throw categoryResultForCosts.error;
  const costCategoryIds = new Map((categoryResultForCosts.data || []).map((row) => [row.name, row.id]));

  const costs = load<{
    id: string;
    name: string;
    category: string;
    amount: string;
    date: string;
    description?: string;
    created_at?: string;
  }>('operational_costs');
  await upsert('operational_costs', costs.map((row) => ({
    id: row.id,
    organization_id: organizationId,
    category_id: costCategoryIds.get(clean(row.category) || 'Miscellaneous')!,
    amount: number(row.amount),
    description: clean(row.description) || row.name,
    expense_date: row.date,
    created_at: date(row.created_at) || new Date().toISOString(),
  })), 'organization_id,id');

  const sales = load<{
    id: string;
    receipt_number: string;
    customer_id?: string;
    seller_id?: string;
    subtotal: string;
    discount: string;
    discount_type: string;
    total: string;
    payment_method: string;
    created_at?: string;
    notes?: string;
    delivery_address?: string;
    delivery_date?: string;
    delivery_time?: string;
    packaging_cost?: string;
    order_status?: string;
    amount_paid?: string;
    delivered_at?: string;
    university?: string;
    delivery_fee?: string;
  }>('sales');

  const validCustomerIds = new Set(customers.map((row) => row.id));
  const validSellerIds = new Set(sellers.map((row) => row.id));

  const fulfillmentMap: Record<string, string> = {
    pending: 'pending',
    processing: 'processing',
    packed: 'packed',
    ready_for_delivery: 'ready_for_delivery',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };

  await upsert('sales', sales.map((row) => {
    const total = number(row.total);
    const amountPaid = Math.min(number(row.amount_paid), total);
    const amountDue = Math.max(total - amountPaid, 0);
    const paymentStatus = amountDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
    const deliveryAddress = clean(row.delivery_address) || clean(row.university)
      ? { address_line: clean(row.delivery_address) || clean(row.university) }
      : null;
    let deliveryScheduledAt: string | null = null;
    if (row.delivery_date) {
      const timestamp = row.delivery_time
        ? new Date(`${row.delivery_date}T${row.delivery_time}:00+06:00`)
        : new Date(`${row.delivery_date}T00:00:00+06:00`);
      if (!Number.isNaN(timestamp.getTime())) deliveryScheduledAt = timestamp.toISOString();
    }

    return {
      id: row.id,
      organization_id: organizationId,
      receipt_number: row.receipt_number,
      customer_id: row.customer_id && validCustomerIds.has(row.customer_id) ? row.customer_id : null,
      seller_id: row.seller_id && validSellerIds.has(row.seller_id) ? row.seller_id : null,
      subtotal: number(row.subtotal),
      discount_amount: number(row.discount),
      delivery_fee: number(row.delivery_fee),
      total_amount: total,
      amount_paid: amountPaid,
      amount_due: amountDue,
      payment_status: paymentStatus,
      fulfillment_status: fulfillmentMap[String(row.order_status || '').toLowerCase()] || 'pending',
      delivery_address_snapshot: deliveryAddress,
      delivery_scheduled_at: deliveryScheduledAt,
      payment_method: 'other',
      notes: clean(row.notes),
      idempotency_key: `legacy-sale:${row.id}`,
      created_at: date(row.created_at) || new Date().toISOString(),
    };
  }), 'organization_id,id');

  const saleItems = load<{
    id: string;
    sale_id: string;
    product_id?: string;
    product_name: string;
    stock_code: string;
    quantity: number;
    unit_price: string;
    buying_price: string;
    subtotal: string;
  }>('sale_items');
  const validSaleIds = new Set(sales.map((row) => row.id));
  const validProductIds = new Set(sourceProducts.map((row) => row.id));
  await upsert('sale_items', saleItems
    .filter((row) => validSaleIds.has(row.sale_id))
    .map((row) => ({
      id: row.id,
      organization_id: organizationId,
      sale_id: row.sale_id,
      product_id: row.product_id && validProductIds.has(row.product_id) ? row.product_id : null,
      product_name_snapshot: row.product_name,
      sku_snapshot: row.stock_code,
      quantity: number(row.quantity, 1),
      unit_price: number(row.unit_price),
      unit_cost_snapshot: number(row.buying_price),
      discount_amount: 0,
      line_total: number(row.subtotal),
    })), 'organization_id,id');

  const smsLogs = load<{
    id: string;
    event: string;
    recipient: string;
    request_id?: string;
    status: string;
    error?: string;
    sale_id?: string;
    created_at?: string;
  }>('sms_logs');
  await upsert('communication_logs', smsLogs.map((row) => {
    const statusMap: Record<string, string> = {
      sent: 'sent', delivered: 'delivered', failed: 'failed', queued: 'queued', pending: 'queued',
    };
    const deliveryStatus = statusMap[String(row.status || '').toLowerCase()] || 'failed';
    const matchingCustomer = customers.find((customer) => clean(customer.phone) === clean(row.recipient));
    return {
      id: row.id,
      organization_id: organizationId,
      customer_id: matchingCustomer?.id || null,
      channel: 'sms',
      template_type: clean(row.event) || 'legacy_sms',
      recipient: row.recipient,
      provider_reference: clean(row.request_id),
      delivery_status: deliveryStatus,
      error_code: clean(row.error),
      sent_at: deliveryStatus === 'queued' ? null : date(row.created_at),
      created_at: date(row.created_at) || new Date().toISOString(),
    };
  }), 'organization_id,id');

  const activityLogs = load<{
    id: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    entity_label?: string;
    description?: string;
    changes?: string;
    created_at?: string;
  }>('activity_logs');
  let changesParsed: unknown = null;
  await upsert('audit_logs', activityLogs.map((row) => {
    changesParsed = null;
    if (row.changes) {
      try { changesParsed = JSON.parse(row.changes); } catch { changesParsed = null; }
    }
    const category = row.action.includes('payment') ? 'payment'
      : row.action.includes('delivery') || row.action.includes('status') ? 'sale'
      : row.action.includes('setting') ? 'settings'
      : row.action.includes('return') ? 'return'
      : row.action.includes('login') ? 'auth'
      : 'sale';
    return {
      id: row.id,
      organization_id: organizationId,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id && /^[0-9a-f-]{36}$/i.test(row.entity_id) ? row.entity_id : null,
      entity_reference: clean(row.entity_label),
      before_data: null,
      after_data: changesParsed || (clean(row.description) ? { description: row.description } : null),
      request_id: null,
      event_category: category,
      created_at: date(row.created_at) || new Date().toISOString(),
    };
  }), 'organization_id,id');

  console.log(JSON.stringify({
    organizationId,
    suppliers: suppliers.length,
    sellers: sellers.length,
    customers: customers.length,
    categories: categoryNames.length,
    products: sourceProducts.length,
    operationalCosts: costs.length,
    sales: sales.length,
    saleItems: saleItems.filter((row) => validSaleIds.has(row.sale_id)).length,
    smsLogs: smsLogs.length,
    activityLogs: activityLogs.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
