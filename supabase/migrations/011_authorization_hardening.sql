-- Prevent authenticated users from moving tenant-owned records between organizations.
create or replace function public.prevent_tenant_reparenting() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Organization ownership cannot be changed';
  end if;
  return new;
end;
$$;

create trigger categories_tenant_guard before update on public.categories for each row execute function public.prevent_tenant_reparenting();
create trigger suppliers_tenant_guard before update on public.suppliers for each row execute function public.prevent_tenant_reparenting();
create trigger products_tenant_guard before update on public.products for each row execute function public.prevent_tenant_reparenting();
create trigger customers_tenant_guard before update on public.customers for each row execute function public.prevent_tenant_reparenting();
create trigger sellers_tenant_guard before update on public.sellers for each row execute function public.prevent_tenant_reparenting();
create trigger sales_tenant_guard before update on public.sales for each row execute function public.prevent_tenant_reparenting();
create trigger sale_items_tenant_guard before update on public.sale_items for each row execute function public.prevent_tenant_reparenting();
create trigger payments_tenant_guard before update on public.payments for each row execute function public.prevent_tenant_reparenting();
create trigger delivery_tenant_guard before update on public.delivery_assignments for each row execute function public.prevent_tenant_reparenting();

create or replace function public.validate_membership_role_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if new.organization_id is distinct from old.organization_id or new.user_id is distinct from old.user_id then
    raise exception 'Membership ownership cannot be changed';
  end if;
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    if not public.is_admin(old.organization_id) then raise exception 'Only an organization admin may change membership access'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_rider_delivery_update() returns trigger
language plpgsql set search_path = pg_catalog, public, auth as $$
begin
  if public.is_rider(old.organization_id) and old.rider_user_id = auth.uid() then
    new.organization_id = old.organization_id;
    new.sale_id = old.sale_id;
    new.rider_user_id = old.rider_user_id;
    new.assigned_by = old.assigned_by;
    new.assigned_at = old.assigned_at;
    new.created_at = old.created_at;
    if new.status not in ('assigned', 'out_for_delivery', 'delivered', 'failed') then raise exception 'Invalid Rider delivery transition'; end if;
  end if;
  return new;
end;
$$;
create trigger rider_delivery_update_guard before update on public.delivery_assignments for each row execute function public.protect_rider_delivery_update();

-- Prevent a normal member from enumerating every membership in an organization.
drop policy if exists memberships_member_read on public.memberships;
create policy memberships_self_read on public.memberships for select to authenticated using (user_id = auth.uid() or public.is_admin(organization_id));
