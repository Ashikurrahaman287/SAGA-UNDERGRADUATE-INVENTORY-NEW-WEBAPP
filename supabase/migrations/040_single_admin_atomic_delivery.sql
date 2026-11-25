alter type public.payment_method add value if not exists 'due';

create table if not exists public.delivery_done_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  idempotency_key text not null,
  payment_received numeric(18,2) not null default 0 check (payment_received >= 0),
  confirmed_paid_after numeric(18,2) not null default 0 check (confirmed_paid_after >= 0),
  due_after numeric(18,2) not null default 0 check (due_after >= 0),
  actor_user_id uuid references auth.users(id) on delete restrict,
  completed_at timestamptz not null default now(),
  unique (organization_id, sale_id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
alter table public.delivery_done_events enable row level security;
revoke all on public.delivery_done_events from public, anon, authenticated;

create or replace function public.complete_sale_delivery(
  p_organization_id uuid,
  p_sale_id uuid,
  p_payment_amount numeric,
  p_payment_method public.payment_method,
  p_payment_reference text,
  p_notes text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  sale_row public.sales%rowtype;
  previous_event public.delivery_done_events%rowtype;
  paid_before numeric(18,2);
  due_before numeric(18,2);
  received numeric(18,2);
  paid_after numeric(18,2);
  due_after_value numeric(18,2);
  status_value public.payment_status;
  assignment_row public.delivery_assignments%rowtype;
begin
  if not public.is_admin(p_organization_id) then raise exception 'Administrator access is required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;
  if coalesce(p_payment_amount, 0) < 0 then raise exception 'Payment amount cannot be negative'; end if;

  select * into previous_event
  from public.delivery_done_events
  where organization_id = p_organization_id and sale_id = p_sale_id
  for update;
  if found then
    return jsonb_build_object(
      'sale_id', p_sale_id,
      'delivered', true,
      'idempotent', true,
      'payment_received', previous_event.payment_received,
      'confirmed_paid_amount', previous_event.confirmed_paid_after,
      'amount_due', previous_event.due_after
    );
  end if;

  select * into sale_row
  from public.sales
  where organization_id = p_organization_id and id = p_sale_id
  for update;
  if not found then raise exception 'Sale not found'; end if;
  if sale_row.fulfillment_status = 'cancelled' then raise exception 'Cancelled orders cannot be delivered'; end if;
  if sale_row.fulfillment_status = 'delivered' then raise exception 'Order is already delivered'; end if;

  paid_before := coalesce(sale_row.confirmed_paid_amount, sale_row.amount_paid, 0);
  due_before := greatest(round(sale_row.total_amount - paid_before, 2), 0);
  received := round(coalesce(p_payment_amount, 0), 2);
  if received > due_before then raise exception 'Payment exceeds the outstanding due'; end if;
  paid_after := least(round(paid_before + received, 2), sale_row.total_amount);
  due_after_value := greatest(round(sale_row.total_amount - paid_after, 2), 0);
  if due_after_value = 0 then status_value := 'paid';
  elsif paid_after > 0 then status_value := 'partial';
  else status_value := 'unpaid'; end if;

  -- Existing financial-field guards permit atomic RPC transactions only.
  perform set_config('saga.sale_transaction', 'true', true);

  if received > 0 then
    insert into public.payments (
      organization_id, sale_id, amount, payment_method, payment_reference,
      collected_by, collected_at, status, idempotency_key, notes
    ) values (
      p_organization_id, p_sale_id, received, p_payment_method,
      nullif(trim(coalesce(p_payment_reference, '')), ''), auth.uid(), now(), 'completed',
      p_idempotency_key || ':payment', nullif(trim(coalesce(p_notes, '')), '')
    );
  end if;

  update public.sales
  set confirmed_paid_amount = paid_after,
      amount_paid = paid_after,
      amount_due = due_after_value,
      payment_status = status_value,
      fulfillment_status = 'delivered'::public.fulfillment_status
  where organization_id = p_organization_id and id = p_sale_id;

  perform set_config('saga.admin_delivery_completion', 'true', true);
  select * into assignment_row
  from public.delivery_assignments
  where organization_id = p_organization_id and sale_id = p_sale_id
  for update;
  if found then
    update public.delivery_assignments
    set status = 'delivered', delivered_at = now(), updated_at = now()
    where id = assignment_row.id;
  else
    insert into public.delivery_assignments (
      organization_id, sale_id, status, delivered_at
    ) values (
      p_organization_id, p_sale_id, 'delivered', now()
    );
  end if;

  update public.packaging_records
  set packaging_status = 'ready', ready_at = coalesce(ready_at, now())
  where organization_id = p_organization_id and sale_id = p_sale_id;

  insert into public.delivery_done_events (
    organization_id, sale_id, idempotency_key, payment_received,
    confirmed_paid_after, due_after, actor_user_id
  ) values (
    p_organization_id, p_sale_id, p_idempotency_key, received,
    paid_after, due_after_value, auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    p_organization_id, auth.uid(), 'delivery_done', 'sale', p_sale_id,
    jsonb_build_object('amount_paid', paid_before, 'amount_due', due_before),
    jsonb_build_object('amount_paid', paid_after, 'amount_due', due_after_value, 'payment_received', received),
    p_idempotency_key
  );

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'delivered', true,
    'idempotent', false,
    'should_notify', true,
    'payment_received', received,
    'confirmed_paid_amount', paid_after,
    'amount_due', due_after_value
  );
end;
$$;
revoke all on function public.complete_sale_delivery(uuid, uuid, numeric, public.payment_method, text, text, text) from public;
grant execute on function public.complete_sale_delivery(uuid, uuid, numeric, public.payment_method, text, text, text) to authenticated;

create or replace function public.validate_rider_assignment() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if new.rider_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = new.organization_id
      and m.user_id = new.rider_user_id
      and m.role = 'rider'
      and m.is_active
      and m.rider_eligible
  ) then raise exception 'Delivery rider must be an eligible Rider in this organization'; end if;

  if new.status = 'delivered' and exists (
    select 1 from public.sales s
    where s.organization_id = new.organization_id
      and s.id = new.sale_id
      and s.fulfillment_status = 'cancelled'
  ) then raise exception 'Cancelled deliveries cannot be completed'; end if;

  if new.status = 'delivered'
     and new.rider_user_id is null
     and coalesce(current_setting('saga.admin_delivery_completion', true), 'false') <> 'true' then
    raise exception 'Delivery completion requires an Admin Delivery Done action';
  end if;
  return new;
end;
$$;
