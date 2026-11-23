alter type public.stock_movement_type add value if not exists 'opening_stock';
alter type public.stock_movement_type add value if not exists 'manual_increase';
alter type public.stock_movement_type add value if not exists 'manual_decrease';

create unique index products_org_sku_normalized on public.products(organization_id, upper(sku));
create index products_org_name on public.products(organization_id, lower(name));

create or replace function public.prevent_direct_quantity_update() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.quantity is distinct from old.quantity and coalesce(current_setting('saga.stock_operation', true), 'false') <> 'true' then
    raise exception 'Stock must be changed through an inventory operation';
  end if;
  return new;
end;
$$;
create trigger products_quantity_guard before update on public.products for each row execute function public.prevent_direct_quantity_update();

drop policy if exists stock_staff_insert on public.stock_movements;
create policy stock_operation_insert on public.stock_movements for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.stock_operation', true), 'false') = 'true');

create or replace function public.create_product_with_opening_stock(
  p_organization_id uuid,
  p_name text,
  p_sku text,
  p_description text,
  p_category_id uuid,
  p_supplier_id uuid,
  p_cost_price numeric,
  p_selling_price numeric,
  p_initial_stock numeric,
  p_low_stock_threshold numeric,
  p_unit text,
  p_is_active boolean,
  p_reason text
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  new_product_id uuid;
  normalized_sku text := upper(trim(p_sku));
  normalized_name text := trim(p_name);
begin
  if not public.is_staff(p_organization_id) then raise exception 'Product access denied'; end if;
  if normalized_name = '' or normalized_sku = '' then raise exception 'Product name and SKU are required'; end if;
  if p_cost_price < 0 or p_selling_price < 0 or p_initial_stock < 0 or p_low_stock_threshold < 0 then raise exception 'Product values cannot be negative'; end if;
  if p_initial_stock > 0 and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Opening stock reason is required'; end if;

  insert into public.products (organization_id, name, sku, description, category_id, supplier_id, cost_price, selling_price, quantity, low_stock_threshold, unit, is_active)
  values (p_organization_id, normalized_name, normalized_sku, nullif(trim(p_description), ''), p_category_id, p_supplier_id, p_cost_price, p_selling_price, p_initial_stock, p_low_stock_threshold, coalesce(nullif(trim(p_unit), ''), 'unit'), coalesce(p_is_active, true))
  returning id into new_product_id;

  if p_initial_stock > 0 then
    perform set_config('saga.stock_operation', 'true', true);
    insert into public.stock_movements (organization_id, product_id, movement_type, quantity, previous_quantity, new_quantity, reason, actor_user_id)
    values (p_organization_id, new_product_id, 'opening_stock', p_initial_stock, 0, p_initial_stock, trim(p_reason), auth.uid());
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_organization_id, auth.uid(), 'product_created', 'product', new_product_id, jsonb_build_object('initial_stock', p_initial_stock, 'sku', normalized_sku));
  return new_product_id;
end;
$$;

create or replace function public.adjust_product_stock(
  p_organization_id uuid,
  p_product_id uuid,
  p_direction text,
  p_quantity numeric,
  p_reason text,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns public.products
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  product_row public.products;
  next_quantity numeric(18,3);
  movement public.stock_movement_type;
begin
  if not public.is_staff(p_organization_id) then raise exception 'Inventory access denied'; end if;
  if p_quantity <= 0 or length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Quantity and reason are required'; end if;
  if p_direction not in ('increase', 'decrease') then raise exception 'Invalid stock adjustment direction'; end if;

  select * into product_row from public.products p where p.organization_id = p_organization_id and p.id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if not product_row.is_active then raise exception 'Archived products cannot be adjusted'; end if;
  next_quantity := case when p_direction = 'increase' then product_row.quantity + p_quantity else product_row.quantity - p_quantity end;
  if next_quantity < 0 then raise exception 'Insufficient stock'; end if;
  movement := case when p_direction = 'increase' then 'manual_increase'::public.stock_movement_type else 'manual_decrease'::public.stock_movement_type end;

  perform set_config('saga.stock_operation', 'true', true);
  update public.products set quantity = next_quantity where organization_id = p_organization_id and id = p_product_id returning * into product_row;
  insert into public.stock_movements (organization_id, product_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, reference_id, reason, actor_user_id)
  values (p_organization_id, p_product_id, movement, p_quantity, product_row.quantity - case when p_direction = 'increase' then p_quantity else -p_quantity end, product_row.quantity, p_reference_type, p_reference_id, trim(p_reason), auth.uid());
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_organization_id, auth.uid(), 'stock_adjusted', 'product', p_product_id, jsonb_build_object('quantity', product_row.quantity - case when p_direction = 'increase' then p_quantity else -p_quantity end), jsonb_build_object('quantity', product_row.quantity, 'movement_type', movement));
  return product_row;
end;
$$;

create or replace function public.archive_product(p_organization_id uuid, p_product_id uuid) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public, auth as $$
declare current_quantity numeric;
begin
  if not public.is_admin(p_organization_id) then raise exception 'Product archive access denied'; end if;
  select quantity into current_quantity from public.products where organization_id = p_organization_id and id = p_product_id for update;
  if current_quantity is null then raise exception 'Product not found'; end if;
  if current_quantity > 0 then raise exception 'Products with available stock cannot be archived'; end if;
  update public.products set is_active = false where organization_id = p_organization_id and id = p_product_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_organization_id, auth.uid(), 'product_archived', 'product', p_product_id, jsonb_build_object('is_active', false));
  return true;
end;
$$;

create or replace function public.list_products(
  p_organization_id uuid,
  p_search text default null,
  p_category_id uuid default null,
  p_supplier_id uuid default null,
  p_active boolean default true,
  p_stock_status text default null,
  p_sort text default 'name',
  p_ascending boolean default true,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public, auth as $$
with filtered as (
  select p.id, p.name, p.sku, p.description, p.category_id, c.name as category_name, p.supplier_id, s.name as supplier_name, p.cost_price, p.selling_price, p.quantity, p.low_stock_threshold, p.unit, p.is_active, p.created_at, p.updated_at,
    case when p.quantity = 0 then 'out_of_stock' when p.quantity <= p.low_stock_threshold then 'low_stock' else 'in_stock' end as stock_status
  from public.products p
  left join public.categories c on c.organization_id = p.organization_id and c.id = p.category_id
  left join public.suppliers s on s.organization_id = p.organization_id and s.id = p.supplier_id
  where p.organization_id = p_organization_id
    and (p_active is null or p.is_active = p_active)
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_supplier_id is null or p.supplier_id = p_supplier_id)
    and (p_search is null or lower(p.name) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%' or lower(p.sku) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%')
    and (p_stock_status is null or (p_stock_status = 'out_of_stock' and p.quantity = 0) or (p_stock_status = 'low_stock' and p.quantity > 0 and p.quantity <= p.low_stock_threshold) or (p_stock_status = 'in_stock' and p.quantity > p.low_stock_threshold))
), page as (
  select * from filtered order by
    case when p_sort = 'name' and p_ascending then name end asc,
    case when p_sort = 'name' and not p_ascending then name end desc,
    case when p_sort = 'sku' and p_ascending then sku end asc,
    case when p_sort = 'sku' and not p_ascending then sku end desc,
    case when p_sort = 'cost_price' and p_ascending then cost_price end asc,
    case when p_sort = 'cost_price' and not p_ascending then cost_price end desc,
    case when p_sort = 'selling_price' and p_ascending then selling_price end asc,
    case when p_sort = 'selling_price' and not p_ascending then selling_price end desc,
    case when p_sort = 'quantity' and p_ascending then quantity end asc,
    case when p_sort = 'quantity' and not p_ascending then quantity end desc,
    id asc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
)
select jsonb_build_object('items', coalesce((select jsonb_agg(row_to_json(page)) from page), '[]'::jsonb), 'total', (select count(*) from filtered));
$$;

revoke all on function public.create_product_with_opening_stock(uuid, text, text, text, uuid, uuid, numeric, numeric, numeric, numeric, text, boolean, text), public.adjust_product_stock(uuid, uuid, text, numeric, text, text, uuid), public.archive_product(uuid, uuid), public.list_products(uuid, text, uuid, uuid, boolean, text, text, boolean, integer, integer) from public;
grant execute on function public.create_product_with_opening_stock(uuid, text, text, text, uuid, uuid, numeric, numeric, numeric, numeric, text, boolean, text), public.adjust_product_stock(uuid, uuid, text, numeric, text, text, uuid), public.archive_product(uuid, uuid), public.list_products(uuid, text, uuid, uuid, boolean, text, text, boolean, integer, integer) to authenticated;
