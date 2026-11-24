create table if not exists public.fulfillment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idempotency_key text not null,
  operation text not null check (operation in ('packaging_transition','delivery_assign','delivery_status','payment_collect')),
  request_hash text not null,
  sale_id uuid not null,
  response_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, operation, idempotency_key),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
alter table public.fulfillment_requests enable row level security;
revoke all on public.fulfillment_requests from anon, authenticated;

create index if not exists packaging_org_status on public.packaging_records(organization_id, packaging_status, updated_at desc);
create index if not exists delivery_org_status on public.delivery_assignments(organization_id, status, scheduled_at);
create index if not exists delivery_org_rider_status on public.delivery_assignments(organization_id, rider_user_id, status);
create index if not exists delivery_events_assignment_created on public.delivery_events(delivery_assignment_id, created_at desc);

create or replace function public.transition_packaging(
  p_organization_id uuid,
  p_sale_id uuid,
  p_new_status public.packaging_status,
  p_packaging_cost numeric,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  sale_row public.sales;
  packaging_row public.packaging_records;
  existing_request public.fulfillment_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':packaging:' || p_sale_id::text || ':' || p_idempotency_key, 0));
  perform set_config('saga.fulfillment_transaction', 'true', true);
  if not public.is_staff(p_organization_id) then raise exception 'Fulfillment access denied'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;

  select * into existing_request from public.fulfillment_requests f
  where f.organization_id = p_organization_id and f.operation = 'packaging_transition' and f.idempotency_key = p_idempotency_key;
  if found then
    if existing_request.request_hash <> p_request_hash then raise exception 'Idempotency key was used with different data'; end if;
    return existing_request.response_data;
  end if;

  select * into sale_row from public.sales s where s.organization_id = p_organization_id and s.id = p_sale_id for update;
  if not found or sale_row.fulfillment_status = 'cancelled' then raise exception 'Sale unavailable'; end if;
  select * into packaging_row from public.packaging_records r where r.organization_id = p_organization_id and r.sale_id = p_sale_id for update;
  if not found then
    insert into public.packaging_records (organization_id, sale_id, packaging_status, packaging_cost)
    values (p_organization_id, p_sale_id, 'pending', 0)
    returning * into packaging_row;
  end if;

  if not (
    (packaging_row.packaging_status = 'pending' and p_new_status in ('in_progress','packed'))
    or (packaging_row.packaging_status = 'in_progress' and p_new_status in ('packed','pending'))
    or (packaging_row.packaging_status = 'packed' and p_new_status = 'ready')
  ) then raise exception 'Invalid packaging transition'; end if;

  if coalesce(p_packaging_cost, 0) < 0 then raise exception 'Packaging cost cannot be negative'; end if;

  insert into public.packaging_events (organization_id, packaging_record_id, previous_status, new_status, actor_user_id)
  values (p_organization_id, packaging_row.id, packaging_row.packaging_status, p_new_status, auth.uid());

  update public.packaging_records
  set packaging_status = p_new_status,
      packaging_cost = coalesce(p_packaging_cost, packaging_cost),
      packed_by = case when p_new_status = 'packed' then auth.uid() else packed_by end,
      packed_at = case when p_new_status = 'packed' then now() else packed_at end,
      ready_at = case when p_new_status = 'ready' then now() else ready_at end
  where id = packaging_row.id;

  update public.sales
  set fulfillment_status = case
    when p_new_status = 'ready' then 'ready_for_delivery'
    when p_new_status = 'packed' then 'packed'
    else 'processing'
  end
  where id = p_sale_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (p_organization_id, auth.uid(), 'packaging_transition', 'sale', p_sale_id,
    jsonb_build_object('packaging_status', packaging_row.packaging_status),
    jsonb_build_object('packaging_status', p_new_status),
    p_request_hash);

  insert into public.fulfillment_requests (organization_id, idempotency_key, operation, request_hash, sale_id, response_data)
  values (p_organization_id, p_idempotency_key, 'packaging_transition', p_request_hash, p_sale_id,
    jsonb_build_object('sale_id', p_sale_id, 'packaging_status', p_new_status));
  return jsonb_build_object('sale_id', p_sale_id, 'packaging_status', p_new_status, 'idempotent', false);
end;
$$;

create or replace function public.assign_delivery(
  p_organization_id uuid,
  p_sale_id uuid,
  p_rider_user_id uuid,
  p_scheduled_at timestamptz,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  sale_row public.sales;
  assignment public.delivery_assignments;
  previous_status public.delivery_status;
  existing_request public.fulfillment_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':assign:' || p_sale_id::text || ':' || p_idempotency_key, 0));
  perform set_config('saga.fulfillment_transaction', 'true', true);
  if not public.is_staff(p_organization_id) then raise exception 'Delivery assignment access denied'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;

  select * into existing_request from public.fulfillment_requests f
  where f.organization_id = p_organization_id and f.operation = 'delivery_assign' and f.idempotency_key = p_idempotency_key;
  if found then
    if existing_request.request_hash <> p_request_hash then raise exception 'Idempotency key was used with different data'; end if;
    return existing_request.response_data;
  end if;

  select * into sale_row from public.sales s where s.organization_id = p_organization_id and s.id = p_sale_id for update;
  if not found or sale_row.fulfillment_status = 'cancelled' then raise exception 'Sale unavailable'; end if;
  if not exists (select 1 from public.memberships m where m.organization_id = p_organization_id and m.user_id = p_rider_user_id and m.role = 'rider' and m.is_active) then
    raise exception 'Rider is inactive or outside the organization';
  end if;

  select * into assignment from public.delivery_assignments d where d.organization_id = p_organization_id and d.sale_id = p_sale_id for update;
  if found then
    previous_status := assignment.status;
    update public.delivery_assignments set rider_user_id = p_rider_user_id, assigned_by = auth.uid(), status = 'assigned', scheduled_at = p_scheduled_at, assigned_at = now()
    where id = assignment.id;
  else
    previous_status := 'unassigned';
    insert into public.delivery_assignments (organization_id, sale_id, rider_user_id, assigned_by, status, scheduled_at, assigned_at)
    values (p_organization_id, p_sale_id, p_rider_user_id, auth.uid(), 'assigned', p_scheduled_at, now())
    returning * into assignment;
  end if;

  insert into public.delivery_events (organization_id, delivery_assignment_id, actor_user_id, previous_status, new_status, notes)
  values (p_organization_id, assignment.id, auth.uid(), previous_status, 'assigned', 'Rider assignment updated');
  update public.sales set fulfillment_status = 'processing' where id = p_sale_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (p_organization_id, auth.uid(), 'delivery_assigned', 'sale', p_sale_id,
    jsonb_build_object('rider_user_id', nullif(previous_status::text, '')), jsonb_build_object('rider_user_id', p_rider_user_id), p_request_hash);

  insert into public.fulfillment_requests (organization_id, idempotency_key, operation, request_hash, sale_id, response_data)
  values (p_organization_id, p_idempotency_key, 'delivery_assign', p_request_hash, p_sale_id,
    jsonb_build_object('sale_id', p_sale_id, 'rider_user_id', p_rider_user_id, 'status', 'assigned'));
  return jsonb_build_object('sale_id', p_sale_id, 'rider_user_id', p_rider_user_id, 'status', 'assigned', 'idempotent', false);
end;
$$;

create or replace function public.update_delivery_status(
  p_organization_id uuid,
  p_sale_id uuid,
  p_new_status public.delivery_status,
  p_notes text,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  assignment public.delivery_assignments;
  sale_row public.sales;
  existing_request public.fulfillment_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':delivery:' || p_sale_id::text || ':' || p_idempotency_key, 0));
  perform set_config('saga.fulfillment_transaction', 'true', true);
  if not (public.is_staff(p_organization_id) or public.is_rider(p_organization_id)) then raise exception 'Delivery access denied'; end if;
  select * into existing_request from public.fulfillment_requests f
  where f.organization_id = p_organization_id and f.operation = 'delivery_status' and f.idempotency_key = p_idempotency_key;
  if found then
    if existing_request.request_hash <> p_request_hash then raise exception 'Idempotency key was used with different data'; end if;
    return existing_request.response_data;
  end if;
  select * into sale_row from public.sales s where s.organization_id = p_organization_id and s.id = p_sale_id for update;
  if not found or sale_row.fulfillment_status = 'cancelled' then raise exception 'Sale unavailable'; end if;
  select * into assignment from public.delivery_assignments d where d.organization_id = p_organization_id and d.sale_id = p_sale_id for update;
  if not found or assignment.rider_user_id is null then raise exception 'Delivery is not assigned'; end if;
  if public.is_rider(p_organization_id) and assignment.rider_user_id <> auth.uid() then raise exception 'Delivery access denied'; end if;

  if not (
    (assignment.status = 'assigned' and p_new_status in ('out_for_delivery','failed','cancelled'))
    or (assignment.status = 'out_for_delivery' and p_new_status in ('delivered','failed'))
  ) then raise exception 'Invalid delivery transition'; end if;
  if p_new_status = 'cancelled' and not public.is_staff(p_organization_id) then raise exception 'Only staff may cancel delivery'; end if;

  insert into public.delivery_events (organization_id, delivery_assignment_id, actor_user_id, previous_status, new_status, notes)
  values (p_organization_id, assignment.id, auth.uid(), assignment.status, p_new_status, nullif(trim(coalesce(p_notes, '')), ''));
  update public.delivery_assignments
  set status = p_new_status, delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
  where id = assignment.id;
  update public.sales
  set fulfillment_status = case when p_new_status = 'delivered' then 'delivered' when p_new_status = 'out_for_delivery' then 'out_for_delivery' when p_new_status = 'cancelled' then 'cancelled' else 'processing' end
  where id = p_sale_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (p_organization_id, auth.uid(), 'delivery_status_updated', 'sale', p_sale_id, jsonb_build_object('status', assignment.status), jsonb_build_object('status', p_new_status), p_request_hash);

  insert into public.fulfillment_requests (organization_id, idempotency_key, operation, request_hash, sale_id, response_data)
  values (p_organization_id, p_idempotency_key, 'delivery_status', p_request_hash, p_sale_id, jsonb_build_object('sale_id', p_sale_id, 'status', p_new_status));
  return jsonb_build_object('sale_id', p_sale_id, 'status', p_new_status, 'idempotent', false);
end;
$$;

create or replace function public.collect_delivery_payment(
  p_organization_id uuid,
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_payment_reference text,
  p_notes text,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  assignment public.delivery_assignments;
  sale_row public.sales;
  existing_request public.fulfillment_requests;
  confirmed_total numeric(18,2);
  next_paid numeric(18,2);
  next_due numeric(18,2);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':collect:' || p_sale_id::text || ':' || p_idempotency_key, 0));
  perform set_config('saga.fulfillment_transaction', 'true', true);
  if not (public.is_staff(p_organization_id) or public.is_rider(p_organization_id)) then raise exception 'Payment collection denied'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Collected amount must be positive'; end if;
  select * into existing_request from public.fulfillment_requests f
  where f.organization_id = p_organization_id and f.operation = 'payment_collect' and f.idempotency_key = p_idempotency_key;
  if found then
    if existing_request.request_hash <> p_request_hash then raise exception 'Idempotency key was used with different data'; end if;
    return existing_request.response_data;
  end if;
  select * into assignment from public.delivery_assignments d where d.organization_id = p_organization_id and d.sale_id = p_sale_id for update;
  if not found or assignment.rider_user_id is null then raise exception 'Delivery is not assigned'; end if;
  if public.is_rider(p_organization_id) and assignment.rider_user_id <> auth.uid() then raise exception 'Payment collection denied'; end if;
  select * into sale_row from public.sales s where s.organization_id = p_organization_id and s.id = p_sale_id for update;
  if not found or sale_row.fulfillment_status = 'cancelled' then raise exception 'Sale unavailable'; end if;

  select coalesce(sum(p.amount), 0) into confirmed_total
  from public.payments p
  where p.organization_id = p_organization_id and p.sale_id = p_sale_id and p.status = 'completed';
  next_paid := confirmed_total + round(p_amount, 2);
  if next_paid > sale_row.total_amount then raise exception 'Payment cannot exceed the sale total'; end if;
  next_due := round(sale_row.total_amount - next_paid, 2);

  insert into public.payments (organization_id, sale_id, amount, payment_method, payment_reference, collected_by, collected_at, status, idempotency_key, notes)
  values (p_organization_id, p_sale_id, round(p_amount, 2), p_payment_method, nullif(trim(coalesce(p_payment_reference, '')), ''), auth.uid(), now(), 'completed', p_idempotency_key, nullif(trim(coalesce(p_notes, '')), ''));

  update public.sales
  set amount_paid = next_paid,
      amount_due = next_due,
      payment_status = case when next_due = 0 then 'paid' when next_paid > 0 then 'partial' else 'unpaid' end
  where id = p_sale_id;

  insert into public.delivery_events (organization_id, delivery_assignment_id, actor_user_id, previous_status, new_status, collection_amount, payment_method, notes)
  values (p_organization_id, assignment.id, auth.uid(), assignment.status, assignment.status, round(p_amount, 2), p_payment_method, nullif(trim(coalesce(p_notes, '')), ''));

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (p_organization_id, auth.uid(), 'payment_collected', 'sale', p_sale_id,
    jsonb_build_object('amount_paid', sale_row.amount_paid, 'amount_due', sale_row.amount_due),
    jsonb_build_object('amount_paid', next_paid, 'amount_due', next_due), p_request_hash);

  insert into public.fulfillment_requests (organization_id, idempotency_key, operation, request_hash, sale_id, response_data)
  values (p_organization_id, p_idempotency_key, 'payment_collect', p_request_hash, p_sale_id,
    jsonb_build_object('sale_id', p_sale_id, 'amount_collected', round(p_amount, 2), 'amount_paid', next_paid, 'amount_due', next_due));
  return jsonb_build_object('sale_id', p_sale_id, 'amount_collected', round(p_amount, 2), 'amount_paid', next_paid, 'amount_due', next_due, 'idempotent', false);
end;
$$;

revoke all on function public.transition_packaging(uuid, uuid, public.packaging_status, numeric, text, text), public.assign_delivery(uuid, uuid, uuid, timestamptz, text, text), public.update_delivery_status(uuid, uuid, public.delivery_status, text, text, text), public.collect_delivery_payment(uuid, uuid, numeric, public.payment_method, text, text, text, text) from public;
grant execute on function public.transition_packaging(uuid, uuid, public.packaging_status, numeric, text, text), public.assign_delivery(uuid, uuid, uuid, timestamptz, text, text), public.update_delivery_status(uuid, uuid, public.delivery_status, text, text, text), public.collect_delivery_payment(uuid, uuid, numeric, public.payment_method, text, text, text, text) to authenticated;

grant insert on public.fulfillment_requests to authenticated;
create policy fulfillment_requests_rpc_insert on public.fulfillment_requests for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true');

drop policy if exists packaging_staff_access on public.packaging_records;
drop policy if exists packaging_staff_read on public.packaging_records;
create policy packaging_staff_read on public.packaging_records for select to authenticated
using (public.is_staff(organization_id));
create policy packaging_rpc_update on public.packaging_records for update to authenticated
using (public.is_staff(organization_id) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true')
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true');

drop policy if exists packaging_events_staff_insert on public.packaging_events;
create policy packaging_events_rpc_insert on public.packaging_events for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true');

drop policy if exists delivery_staff_insert on public.delivery_assignments;
create policy delivery_rpc_insert on public.delivery_assignments for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true');
drop policy if exists delivery_staff_update on public.delivery_assignments;
drop policy if exists delivery_rider_progress on public.delivery_assignments;
create policy delivery_rpc_update on public.delivery_assignments for update to authenticated
using ((public.is_staff(organization_id) or public.is_rider(organization_id)) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true')
with check ((public.is_staff(organization_id) or public.is_rider(organization_id)) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true');

drop policy if exists delivery_events_insert on public.delivery_events;
create policy delivery_events_rpc_insert on public.delivery_events for insert to authenticated
with check ((public.is_staff(organization_id) or public.is_rider(organization_id)) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true');

drop policy if exists sales_staff_update on public.sales;
create policy sales_rpc_fulfillment_update on public.sales for update to authenticated
using (public.is_staff(organization_id) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true')
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true');
