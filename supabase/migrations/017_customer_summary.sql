create or replace function public.get_customer_summary(p_organization_id uuid, p_customer_id uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public, auth as $$
  select jsonb_build_object('totalOrders', count(*)::integer, 'totalPurchase', coalesce(sum(s.total_amount), 0), 'averageOrderValue', coalesce(avg(s.total_amount), 0), 'lastPurchase', max(s.created_at))
  from public.sales s
  where s.organization_id = p_organization_id and s.customer_id = p_customer_id and s.fulfillment_status <> 'cancelled' and public.is_staff(p_organization_id);
$$;
revoke all on function public.get_customer_summary(uuid, uuid) from public;
grant execute on function public.get_customer_summary(uuid, uuid) to authenticated;

create or replace function public.get_customer_metrics(p_organization_id uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public, auth as $$
  select jsonb_build_object(
    'totalCustomers', count(*),
    'activeCustomers', count(*) filter (where c.is_active),
    'newCustomers', count(*) filter (where c.created_at >= now() - interval '30 days'),
    'customersWithPurchases', count(*) filter (where exists (select 1 from public.sales s where s.organization_id = c.organization_id and s.customer_id = c.id and s.fulfillment_status <> 'cancelled'))
  ) from public.customers c where c.organization_id = p_organization_id and public.is_staff(p_organization_id);
$$;
revoke all on function public.get_customer_metrics(uuid) from public;
grant execute on function public.get_customer_metrics(uuid) to authenticated;
