import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const organizationId = 'c6779a77-9499-414b-994d-8cf6cee792f1';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sales = JSON.parse(
  fs.readFileSync(path.join(String.raw`C:\Users\ASH\Downloads`, 'sales.json'), 'utf8'),
) as Array<{
  id: string;
  receipt_number: string;
  subtotal: string;
  total: string;
  amount_paid: string;
  packaging_cost?: string;
  order_status?: string;
  delivery_date?: string;
  delivery_time?: string;
  delivered_at?: string;
  created_at?: string;
}>;

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function date(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function main() {
  let payments = 0;
  let packaging = 0;
  let receipts = 0;
  let deliveries = 0;

  for (const sale of sales) {
    const saleRow = await supabase
      .from('sales')
      .select('id,receipt_number,amount_paid,total_amount,created_at')
      .eq('organization_id', organizationId)
      .eq('id', sale.id)
      .maybeSingle();
    if (saleRow.error) throw saleRow.error;
    if (!saleRow.data) continue;

    const paid = Math.min(number(sale.amount_paid), number(saleRow.data.total_amount));
    if (paid > 0) {
      const result = await supabase.from('payments').upsert({
        organization_id: organizationId,
        sale_id: sale.id,
        amount: paid,
        payment_method: 'other',
        payment_reference: sale.receipt_number,
        collected_at: date(sale.created_at) || saleRow.data.created_at,
        status: 'completed',
        idempotency_key: `legacy-payment:${sale.id}`,
        notes: 'Migrated from legacy sales data',
      }, { onConflict: 'organization_id,idempotency_key' });
      if (result.error) throw result.error;
      payments++;
    }

    const status = String(sale.order_status || '').toLowerCase();
    const packagingStatus = status === 'delivered' || status === 'ready_for_delivery'
      ? 'ready'
      : status === 'packed'
        ? 'packed'
        : 'pending';
    const packagingResult = await supabase.from('packaging_records').upsert({
      organization_id: organizationId,
      sale_id: sale.id,
      packaging_status: packagingStatus,
      packaging_cost: number(sale.packaging_cost),
    }, { onConflict: 'organization_id,sale_id' });
    if (packagingResult.error) throw packagingResult.error;
    packaging++;

    const receiptResult = await supabase.from('receipts').upsert({
      organization_id: organizationId,
      sale_id: sale.id,
      receipt_number: sale.receipt_number,
      issued_at: date(sale.created_at) || saleRow.data.created_at,
      snapshot: {
        subtotal: number(sale.subtotal),
        total_amount: number(sale.total),
        amount_paid: paid,
        amount_due: Math.max(number(sale.total) - paid, 0),
        legacy: true,
      },
    }, { onConflict: 'organization_id,sale_id' });
    if (receiptResult.error) throw receiptResult.error;
    receipts++;

    const hasDelivery = Boolean(sale.delivery_date || sale.delivered_at || sale.order_status);
    if (hasDelivery) {
      const deliveryStatus = status === 'cancelled'
        ? 'cancelled'
        : status === 'out_for_delivery' || status === 'delivered'
          ? 'out_for_delivery'
          : 'unassigned';
      let scheduledAt: string | null = null;
      if (sale.delivery_date) {
        const parsed = new Date(`${sale.delivery_date}T${sale.delivery_time || '12:00'}:00+06:00`);
        if (!Number.isNaN(parsed.getTime())) scheduledAt = parsed.toISOString();
      }
      const deliveryResult = await supabase.from('delivery_assignments').upsert({
        organization_id: organizationId,
        sale_id: sale.id,
        status: deliveryStatus,
        scheduled_at: scheduledAt,
        delivered_at: status === 'delivered' ? date(sale.delivered_at) || date(sale.created_at) : null,
      }, { onConflict: 'organization_id,sale_id' });
      if (deliveryResult.error) throw deliveryResult.error;
      deliveries++;
    }
  }

  console.log(JSON.stringify({ payments, packaging, receipts, deliveries }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
