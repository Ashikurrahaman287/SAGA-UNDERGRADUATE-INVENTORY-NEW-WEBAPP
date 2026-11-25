create or replace function public.get_dashboard_summary(
  p_organization_id uuid,
  p_start timestamptz,
  p_end timestamptz
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  organization_timezone text;
  valid_sales_count integer;
  total_sales numeric(18,2);
  revenue numeric(18,2);
  payments_due numeric(18,2);
  stock_value numeric(18,2);
  low_stock_count integer;
  return_count integer;
  return_value numeric(18,2);
  gross_profit numeric(18,2);
  operational_cost numeric(18,2);
  packaging_cost numeric(18,2);
  net_profit numeric(18,2);
  sales_trend jsonb;
  payment_overview jsonb;
  fulfillment_overview jsonb;
  top_products jsonb;
  low_stock_products jsonb;
begin
  if p_end <= p_start then raise exception 'Invalid dashboard date range'; end if;
  if not public.is_admin(p_organization_id) then raise exception 'Dashboard access denied'; end if;

  select o.timezone into organization_timezone
  from public.organizations o
  where o.id = p_organization_id and o.is_active;
  if organization_timezone is null then raise exception 'Organization unavailable'; end if;

  select count(*)::integer,
         coalesce(sum(s.total_amount), 0),
         coalesce(sum(s.total_amount), 0),
         coalesce(sum(s.amount_due), 0)
  into valid_sales_count, total_sales, revenue, payments_due
  from public.sales s
  where s.organization_id = p_organization_id
    and s.created_at >= p_start
    and s.created_at < p_end
    and s.fulfillment_status <> 'cancelled';

  select coalesce(sum(p.quantity * p.cost_price), 0), count(*)::integer
  into stock_value, low_stock_count
  from public.products p
  where p.organization_id = p_organization_id
    and p.is_active
    and p.quantity <= p.low_stock_threshold;

  select count(*)::integer, coalesce(sum(r.total_amount), 0)
  into return_count, return_value
  from public.returns r
  where r.organization_id = p_organization_id
    and r.created_at >= p_start
    and r.created_at < p_end
    and r.status in ('approved', 'processed');

  select coalesce(sum(si.line_total - (si.unit_cost_snapshot * si.quantity)), 0)
  into gross_profit
  from public.sale_items si
  join public.sales s
    on s.organization_id = si.organization_id
   and s.id = si.sale_id
  where si.organization_id = p_organization_id
    and s.created_at >= p_start
    and s.created_at < p_end
    and s.fulfillment_status <> 'cancelled';

  select coalesce(sum(o.amount), 0)
  into operational_cost
  from public.operational_costs o
  where o.organization_id = p_organization_id
    and o.expense_date >= (p_start at time zone organization_timezone)::date
    and o.expense_date < (p_end at time zone organization_timezone)::date;

  select coalesce(sum(s.internal_packaging_cost), 0)
  into packaging_cost
  from public.sales s
  where s.organization_id = p_organization_id
    and s.created_at >= p_start
    and s.created_at < p_end
    and s.fulfillment_status <> 'cancelled';

  net_profit := round(coalesce(gross_profit, 0) - coalesce(operational_cost, 0) - coalesce(packaging_cost, 0), 2);

  select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb)
  into sales_trend
  from (
    select (s.created_at at time zone organization_timezone)::date as day,
           count(*)::integer as sales_count,
           coalesce(sum(s.total_amount), 0) as revenue
    from public.sales s
    where s.organization_id = p_organization_id
      and s.created_at >= p_start
      and s.created_at < p_end
      and s.fulfillment_status <> 'cancelled'
    group by 1
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.payment_status), '[]'::jsonb)
  into payment_overview
  from (
    select s.payment_status::text as payment_status,
           count(*)::integer as order_count,
           coalesce(sum(s.total_amount), 0) as amount
    from public.sales s
    where s.organization_id = p_organization_id
      and s.created_at >= p_start
      and s.created_at < p_end
      and s.fulfillment_status <> 'cancelled'
    group by s.payment_status
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.fulfillment_status), '[]'::jsonb)
  into fulfillment_overview
  from (
    select s.fulfillment_status::text as fulfillment_status,
           count(*)::integer as order_count
    from public.sales s
    where s.organization_id = p_organization_id
      and s.created_at >= p_start
      and s.created_at < p_end
      and s.fulfillment_status <> 'cancelled'
    group by s.fulfillment_status
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.quantity_sold desc), '[]'::jsonb)
  into top_products
  from (
    select si.product_id,
           max(si.product_name_snapshot) as product_name,
           max(si.sku_snapshot) as sku,
           sum(si.quantity) as quantity_sold,
           sum(si.line_total) as sales_value
    from public.sale_items si
    join public.sales s
      on s.organization_id = si.organization_id
     and s.id = si.sale_id
    where si.organization_id = p_organization_id
      and s.created_at >= p_start
      and s.created_at < p_end
      and s.fulfillment_status <> 'cancelled'
    group by si.product_id
    order by sum(si.quantity) desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.quantity asc), '[]'::jsonb)
  into low_stock_products
  from (
    select p.id, p.name as product_name, p.sku, p.quantity, p.low_stock_threshold, p.unit
    from public.products p
    where p.organization_id = p_organization_id
      and p.is_active
      and p.quantity <= p.low_stock_threshold
    order by p.quantity asc
    limit 10
  ) t;

  return jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end, 'timezone', organization_timezone),
    'kpis', jsonb_build_object(
      'salesCount', valid_sales_count,
      'salesValue', total_sales,
      'revenue', revenue,
      'paymentsDue', payments_due,
      'grossProfit', gross_profit,
      'operationalCost', operational_cost,
      'packagingCost', packaging_cost,
      'netProfit', net_profit,
      'stockValue', stock_value,
      'lowStockCount', low_stock_count,
      'returnCount', return_count,
      'returnValue', return_value
    ),
    'salesTrend', sales_trend,
    'paymentOverview', payment_overview,
    'fulfillmentOverview', fulfillment_overview,
    'topProducts', top_products,
    'lowStockProducts', low_stock_products
  );
end;
$$;

revoke all on function public.get_dashboard_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_dashboard_summary(uuid, timestamptz, timestamptz) to authenticated;
