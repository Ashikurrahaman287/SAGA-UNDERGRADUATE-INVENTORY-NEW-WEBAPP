create or replace function public.get_product_summary(p_organization_id uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public, auth as $$
  select jsonb_build_object(
    'totalProducts', count(*),
    'activeProducts', count(*) filter (where p.is_active),
    'outOfStock', count(*) filter (where p.is_active and p.quantity = 0),
    'lowStock', count(*) filter (where p.is_active and p.quantity <= p.low_stock_threshold)
  )
  from public.products p
  where p.organization_id = p_organization_id and public.is_staff(p_organization_id);
$$;
revoke all on function public.get_product_summary(uuid) from public;
grant execute on function public.get_product_summary(uuid) to authenticated;
