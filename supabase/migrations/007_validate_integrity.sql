create or replace function public.validate_membership_role_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if tg_op = 'UPDATE' and (new.role is distinct from old.role or new.organization_id is distinct from old.organization_id or new.user_id is distinct from old.user_id)
     and not public.is_admin(old.organization_id) then
    raise exception 'Only an organization admin may change membership role or ownership';
  end if;
  return new;
end;
$$;
create trigger membership_role_guard before update on public.memberships for each row execute function public.validate_membership_role_change();

create or replace function public.validate_rider_assignment() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if new.rider_user_id is not null and not exists (
    select 1 from public.memberships m where m.organization_id = new.organization_id and m.user_id = new.rider_user_id and m.role = 'rider' and m.is_active
  ) then raise exception 'Delivery rider must be an active Rider in this organization'; end if;
  if new.status = 'delivered' and (new.rider_user_id is null or exists (select 1 from public.sales s where s.organization_id = new.organization_id and s.id = new.sale_id and s.fulfillment_status = 'cancelled')) then
    raise exception 'Cancelled or unassigned deliveries cannot be completed';
  end if;
  return new;
end;
$$;
create trigger delivery_assignment_guard before insert or update on public.delivery_assignments for each row execute function public.validate_rider_assignment();

create or replace function public.validate_stock_movement_snapshot() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.new_quantity < 0 or new.previous_quantity < 0 then raise exception 'Inventory cannot be negative'; end if;
  return new;
end;
$$;
create trigger stock_movement_values before insert on public.stock_movements for each row execute function public.validate_stock_movement_snapshot();

create or replace function public.audit_membership_changes() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (coalesce(new.organization_id, old.organization_id), auth.uid(), tg_op, 'membership', coalesce(new.id, old.id), to_jsonb(old), to_jsonb(new));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger memberships_audit after insert or update or delete on public.memberships for each row execute function public.audit_membership_changes();
