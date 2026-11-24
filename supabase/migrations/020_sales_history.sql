create index if not exists sales_org_created_receipt on public.sales(organization_id, created_at desc, receipt_number);
create index if not exists sales_org_customer_created on public.sales(organization_id, customer_id, created_at desc);
create index if not exists sales_org_seller_created on public.sales(organization_id, seller_id, created_at desc);
create index if not exists sales_org_payment_status on public.sales(organization_id, payment_status, created_at desc);
create index if not exists sales_org_fulfillment_status on public.sales(organization_id, fulfillment_status, created_at desc);
create index if not exists payments_org_sale_status on public.payments(organization_id, sale_id, status, created_at desc);

create or replace function public.list_sales_history(
  p_organization_id uuid,
  p_search text default null,
  p_customer_id uuid default null,
  p_seller_id uuid default null,
  p_payment_status text default null,
  p_fulfillment_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'created_at',
  p_ascending boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
with sales_base as (
  select s.*,
    c.name as customer_name,
    c.phone as customer_phone,
    se.name as seller_name,
    se.reference_code as seller_reference,
    (select count(*)::integer from public.sale_items si where si.organization_id = s.organization_id and si.sale_id = s.id) as item_count,
    case
      when exists (select 1 from public.payments p where p.organization_id = s.organization_id and p.sale_id = s.id and p.status = 'completed')
      then (select coalesce(sum(p.amount), 0) from public.payments p where p.organization_id = s.organization_id and p.sale_id = s.id and p.status = 'completed')
      else s.amount_paid
    end as confirmed_paid
  from public.sales s
  left join public.customers c on c.organization_id = s.organization_id and c.id = s.customer_id
  left join public.sellers se on se.organization_id = s.organization_id and se.id = s.seller_id
  where s.organization_id = p_organization_id
    and public.is_staff(p_organization_id)
    and s.fulfillment_status <> 'cancelled'
    and (p_customer_id is null or s.customer_id = p_customer_id)
    and (p_seller_id is null or s.seller_id = p_seller_id)
    and (p_payment_status is null or s.payment_status::text = p_payment_status)
    and (p_fulfillment_status is null or s.fulfillment_status::text = p_fulfillment_status)
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
    and (
      p_search is null
      or s.receipt_number ilike '%' || trim(p_search) || '%'
      or coalesce(c.name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(c.phone, '') ilike '%' || regexp_replace(trim(p_search), '[^0-9+]', '', 'g') || '%'
      or coalesce(se.name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(se.reference_code, '') ilike '%' || trim(p_search) || '%'
    )
), sorted as (
  select sb.*
  from sales_base sb
  order by
    case when p_sort = 'created_at' and p_ascending then sb.created_at end asc,
    case when p_sort = 'created_at' and not p_ascending then sb.created_at end desc,
    case when p_sort = 'receipt_number' and p_ascending then sb.receipt_number end asc,
    case when p_sort = 'receipt_number' and not p_ascending then sb.receipt_number end desc,
    case when p_sort = 'total_amount' and p_ascending then sb.total_amount end asc,
    case when p_sort = 'total_amount' and not p_ascending then sb.total_amount end desc,
    case when p_sort = 'amount_paid' and p_ascending then sb.confirmed_paid end asc,
    case when p_sort = 'amount_paid' and not p_ascending then sb.confirmed_paid end desc,
    case when p_sort = 'amount_due' and p_ascending then sb.amount_due end asc,
    case when p_sort = 'amount_due' and not p_ascending then sb.amount_due end desc,
    case when p_sort = 'customer_name' and p_ascending then sb.customer_name end asc,
    case when p_sort = 'customer_name' and not p_ascending then sb.customer_name end desc,
    case when p_sort = 'payment_status' and p_ascending then sb.payment_status::text end asc,
    case when p_sort = 'payment_status' and not p_ascending then sb.payment_status::text end desc,
    sb.created_at desc,
    sb.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0)
)
select jsonb_build_object(
  'items', coalesce((select jsonb_agg(row_to_json(sorted)) from sorted), '[]'::jsonb),
  'total', (select count(*)::integer from sales_base)
);
$$;

create or replace function public.get_sales_history_summary(
  p_organization_id uuid,
  p_customer_id uuid default null,
  p_seller_id uuid default null,
  p_payment_status text default null,
  p_fulfillment_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
with filtered as (
  select s.*,
    case
      when exists (select 1 from public.payments p where p.organization_id = s.organization_id and p.sale_id = s.id and p.status = 'completed')
      then (select coalesce(sum(p.amount), 0) from public.payments p where p.organization_id = s.organization_id and p.sale_id = s.id and p.status = 'completed')
      else s.amount_paid
    end as confirmed_paid
  from public.sales s
  where s.organization_id = p_organization_id
    and public.is_staff(p_organization_id)
    and s.fulfillment_status <> 'cancelled'
    and (p_customer_id is null or s.customer_id = p_customer_id)
    and (p_seller_id is null or s.seller_id = p_seller_id)
    and (p_payment_status is null or s.payment_status::text = p_payment_status)
    and (p_fulfillment_status is null or s.fulfillment_status::text = p_fulfillment_status)
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
)
select jsonb_build_object(
  'totalSales', count(*)::integer,
  'totalSalesValue', coalesce(sum(total_amount), 0),
  'amountCollected', coalesce(sum(confirmed_paid), 0),
  'outstandingAmount', coalesce(sum(greatest(total_amount - confirmed_paid, 0)), 0),
  'paidSales', count(*) filter (where greatest(total_amount - confirmed_paid, 0) = 0),
  'partiallyPaidSales', count(*) filter (where confirmed_paid > 0 and confirmed_paid < total_amount),
  'unpaidSales', count(*) filter (where confirmed_paid = 0)
) from filtered;
$$;

revoke all on function public.list_sales_history(uuid, text, uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, integer, integer) from public;
revoke all on function public.get_sales_history_summary(uuid, uuid, uuid, text, text, timestamptz, timestamptz) from public;
grant execute on function public.list_sales_history(uuid, text, uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, integer, integer) to authenticated;
grant execute on function public.get_sales_history_summary(uuid, uuid, uuid, text, text, timestamptz, timestamptz) to authenticated;
