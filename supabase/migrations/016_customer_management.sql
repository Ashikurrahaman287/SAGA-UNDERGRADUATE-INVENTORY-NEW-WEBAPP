alter table public.customer_addresses add column if not exists address_label text;
alter table public.customer_addresses add column if not exists recipient_name text;
alter table public.customer_addresses add column if not exists recipient_phone text;
alter table public.customer_addresses add column if not exists is_active boolean not null default true;
alter table public.communication_consents add column if not exists updated_by uuid references auth.users(id) on delete restrict;
alter table public.communication_consents add column if not exists consent_source text;

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null, note text not null check (length(trim(note)) between 1 and 5000), author_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict
);
create index customer_notes_customer_created on public.customer_notes(organization_id, customer_id, created_at desc);

alter table public.customer_notes enable row level security;
create policy customer_notes_staff_read on public.customer_notes for select to authenticated using (public.is_staff(organization_id));
create policy customer_notes_staff_insert on public.customer_notes for insert to authenticated with check (public.is_staff(organization_id) and author_user_id = auth.uid());
revoke update, delete on public.customer_notes from authenticated;

create or replace function public.normalize_customer_phone(value text) returns text
language sql immutable strict set search_path = pg_catalog as $$
  select case when left(regexp_replace(trim(value), '[^0-9+]', '', 'g'), 1) = '+' then '+' || regexp_replace(substr(regexp_replace(trim(value), '[^0-9+]', '', 'g'), 2), '[^0-9]', '', 'g') else regexp_replace(trim(value), '[^0-9]', '', 'g') end;
$$;
revoke all on function public.normalize_customer_phone(text) from public;
grant execute on function public.normalize_customer_phone(text) to authenticated;

create or replace function public.create_customer_with_address(
  p_organization_id uuid,
  p_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null,
  p_communication_preferences jsonb default '{}'::jsonb,
  p_initial_address jsonb default null
) returns uuid
language plpgsql security invoker set search_path = pg_catalog, public, auth as $$
declare new_customer_id uuid; new_address jsonb;
begin
  if not public.is_staff(p_organization_id) then raise exception 'Customer access denied'; end if;
  if length(trim(p_name)) = 0 or length(public.normalize_customer_phone(p_phone)) < 8 then raise exception 'Customer name and valid phone are required'; end if;
  insert into public.customers (organization_id, name, phone, email, notes, communication_preferences)
  values (p_organization_id, trim(p_name), public.normalize_customer_phone(p_phone), nullif(lower(trim(coalesce(p_email, ''))), ''), nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_communication_preferences, '{}'::jsonb))
  returning id into new_customer_id;
  new_address := p_initial_address;
  if new_address is not null and coalesce(trim(new_address->>'address_line'), '') <> '' then
    insert into public.customer_addresses (organization_id, customer_id, address_label, recipient_name, recipient_phone, address_line, area, city, postal_code, delivery_instructions, is_default)
    values (p_organization_id, new_customer_id, nullif(trim(new_address->>'address_label'), ''), nullif(trim(new_address->>'recipient_name'), ''), nullif(public.normalize_customer_phone(new_address->>'recipient_phone'), ''), trim(new_address->>'address_line'), nullif(trim(new_address->>'area'), ''), trim(new_address->>'city'), nullif(trim(new_address->>'postal_code'), ''), nullif(trim(new_address->>'delivery_instructions'), ''), coalesce((new_address->>'is_default')::boolean, true));
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_organization_id, auth.uid(), 'customer_created', 'customer', new_customer_id, jsonb_build_object('name', trim(p_name)));
  return new_customer_id;
end;
$$;

create or replace function public.list_customers(
  p_organization_id uuid,
  p_search text default null,
  p_active boolean default true,
  p_purchase_activity text default null,
  p_sort text default 'name',
  p_ascending boolean default true,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public, auth as $$
with sales_summary as (
  select s.customer_id, count(*)::integer as total_orders, coalesce(sum(s.total_amount), 0) as total_purchase, max(s.created_at) as last_purchase
  from public.sales s
  where s.organization_id = p_organization_id and s.customer_id is not null and s.fulfillment_status <> 'cancelled'
  group by s.customer_id
), filtered as (
  select c.id, c.name, c.phone, c.email, c.is_active, c.created_at, c.updated_at, coalesce(ss.total_orders, 0) as total_orders, coalesce(ss.total_purchase, 0) as total_purchase, ss.last_purchase
  from public.customers c left join sales_summary ss on ss.customer_id = c.id
  where c.organization_id = p_organization_id and (p_active is null or c.is_active = p_active)
    and (p_search is null or lower(c.name) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%' or c.phone like '%' || replace(replace(p_search, '%', ''), '_', '') || '%' or lower(coalesce(c.email, '')) like '%' || lower(replace(replace(p_search, '%', ''), '_', '')) || '%')
    and (p_purchase_activity is null or (p_purchase_activity = 'with_purchases' and coalesce(ss.total_orders, 0) > 0) or (p_purchase_activity = 'without_purchases' and coalesce(ss.total_orders, 0) = 0))
), page as (
  select * from filtered order by
    case when p_sort = 'name' and p_ascending then name end asc,
    case when p_sort = 'name' and not p_ascending then name end desc,
    case when p_sort = 'created_at' and p_ascending then created_at end asc,
    case when p_sort = 'created_at' and not p_ascending then created_at end desc,
    case when p_sort = 'last_purchase' and p_ascending then last_purchase end asc nulls first,
    case when p_sort = 'last_purchase' and not p_ascending then last_purchase end desc nulls last,
    case when p_sort = 'total_orders' and p_ascending then total_orders end asc,
    case when p_sort = 'total_orders' and not p_ascending then total_orders end desc,
    case when p_sort = 'total_purchase' and p_ascending then total_purchase end asc,
    case when p_sort = 'total_purchase' and not p_ascending then total_purchase end desc,
    id asc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
)
select jsonb_build_object('items', coalesce((select jsonb_agg(row_to_json(page)) from page), '[]'::jsonb), 'total', (select count(*) from filtered));
$$;

create or replace function public.set_default_customer_address(p_organization_id uuid, p_customer_id uuid, p_address_id uuid) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public, auth as $$
begin
  if not public.is_staff(p_organization_id) then raise exception 'Customer access denied'; end if;
  if not exists (select 1 from public.customer_addresses a where a.organization_id = p_organization_id and a.customer_id = p_customer_id and a.id = p_address_id and a.is_active) then raise exception 'Address not found'; end if;
  update public.customer_addresses set is_default = false where organization_id = p_organization_id and customer_id = p_customer_id;
  update public.customer_addresses set is_default = true where organization_id = p_organization_id and customer_id = p_customer_id and id = p_address_id;
  return true;
end;
$$;

revoke all on function public.create_customer_with_address(uuid, text, text, text, text, jsonb, jsonb), public.list_customers(uuid, text, boolean, text, text, boolean, integer, integer), public.set_default_customer_address(uuid, uuid, uuid) from public;
grant execute on function public.create_customer_with_address(uuid, text, text, text, text, jsonb, jsonb), public.list_customers(uuid, text, boolean, text, text, boolean, integer, integer), public.set_default_customer_address(uuid, uuid, uuid) to authenticated;
