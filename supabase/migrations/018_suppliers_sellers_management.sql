alter table public.suppliers add column if not exists alternative_phone text;
alter table public.suppliers add column if not exists city text;
alter table public.suppliers add column if not exists website text;
alter table public.suppliers add column if not exists reference_code text;
alter table public.suppliers add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table public.suppliers add column if not exists updated_by uuid references auth.users(id) on delete restrict;
alter table public.sellers add column if not exists reference_code text;
alter table public.sellers add column if not exists address text;
alter table public.sellers add column if not exists notes text;
alter table public.sellers add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table public.sellers add column if not exists updated_by uuid references auth.users(id) on delete restrict;

create unique index suppliers_org_reference_code on public.suppliers(organization_id, upper(reference_code)) where reference_code is not null;
create unique index sellers_org_reference_code on public.sellers(organization_id, upper(reference_code)) where reference_code is not null;
create index suppliers_org_name on public.suppliers(organization_id, lower(name));
create index sellers_org_name on public.sellers(organization_id, lower(name));

create or replace function public.prevent_archived_supplier_assignment() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.supplier_id is not null and not exists (select 1 from public.suppliers s where s.organization_id = new.organization_id and s.id = new.supplier_id and s.is_active) then
    raise exception 'Product supplier must be active in this organization';
  end if;
  return new;
end;
$$;
create trigger products_supplier_active_guard before insert or update on public.products for each row execute function public.prevent_archived_supplier_assignment();

create or replace function public.list_suppliers(p_organization_id uuid, p_search text default null, p_active boolean default true, p_limit integer default 25, p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public, auth as $$
with filtered as (
  select s.id, s.name, s.contact_person, s.phone, s.alternative_phone, s.email, s.address, s.city, s.website, s.reference_code, s.notes, s.is_active, s.created_at, s.updated_at,
    (select count(*)::integer from public.products p where p.organization_id = s.organization_id and p.supplier_id = s.id) as product_count
  from public.suppliers s
  where s.organization_id = p_organization_id and public.is_admin(p_organization_id) and (p_active is null or s.is_active = p_active)
    and (p_search is null or lower(s.name) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%' or lower(coalesce(s.contact_person, '')) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%' or s.phone like '%' || replace(replace(p_search, '%', ''), '_', '') || '%')
), page as (select * from filtered order by name asc, id asc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0))
select jsonb_build_object('items', coalesce((select jsonb_agg(row_to_json(page)) from page), '[]'::jsonb), 'total', (select count(*) from filtered));
$$;

create or replace function public.list_sellers(p_organization_id uuid, p_search text default null, p_active boolean default true, p_limit integer default 25, p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public, auth as $$
with filtered as (
  select s.id, s.name, s.reference_code, s.phone, s.email, s.address, s.notes, s.is_active, s.created_at, s.updated_at,
    count(sa.id)::integer as total_sales, coalesce(sum(sa.total_amount), 0) as sales_value
  from public.sellers s left join public.sales sa on sa.organization_id = s.organization_id and sa.seller_id = s.id and sa.fulfillment_status <> 'cancelled'
  where s.organization_id = p_organization_id and public.is_admin(p_organization_id) and (p_active is null or s.is_active = p_active)
    and (p_search is null or lower(s.name) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%' or lower(coalesce(s.reference_code, '')) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%')
  group by s.id
), page as (select * from filtered order by name asc, id asc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0))
select jsonb_build_object('items', coalesce((select jsonb_agg(row_to_json(page)) from page), '[]'::jsonb), 'total', (select count(*) from filtered));
$$;

revoke all on function public.list_suppliers(uuid, text, boolean, integer, integer), public.list_sellers(uuid, text, boolean, integer, integer) from public;
grant execute on function public.list_suppliers(uuid, text, boolean, integer, integer), public.list_sellers(uuid, text, boolean, integer, integer) to authenticated;
