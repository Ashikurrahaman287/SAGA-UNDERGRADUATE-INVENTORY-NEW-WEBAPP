-- Reschedule a sale/delivery atomically and retain history.
create or replace function public.reschedule_delivery(
  p_organization_id uuid,
  p_sale_id uuid,
  p_scheduled_at timestamptz,
  p_notes text,
  p_idempotency_key text
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  sale_row public.sales;
  previous_at timestamptz;
begin
  if not public.is_staff(p_organization_id) then raise exception 'Administrator access denied'; end if;
  if p_scheduled_at is null then raise exception 'Scheduled delivery time is required'; end if;

  select * into sale_row
  from public.sales
  where organization_id = p_organization_id and id = p_sale_id
  for update;
  if not found or sale_row.fulfillment_status = 'cancelled' then raise exception 'Sale unavailable'; end if;

  previous_at := sale_row.delivery_scheduled_at;
  update public.sales
  set delivery_scheduled_at = p_scheduled_at,
      notes = case
        when coalesce(p_notes, '') = '' then notes
        else concat_ws(E'\n', nullif(notes, ''), p_notes)
      end
  where organization_id = p_organization_id and id = p_sale_id;

  update public.delivery_assignments
  set scheduled_at = p_scheduled_at,
      updated_at = now()
  where organization_id = p_organization_id and sale_id = p_sale_id;

  insert into public.delivery_reschedules (
    organization_id, sale_id, previous_scheduled_at, scheduled_at, notes, actor_user_id
  ) values (
    p_organization_id, p_sale_id, previous_at, p_scheduled_at,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    p_organization_id, auth.uid(), 'delivery_rescheduled', 'sale', p_sale_id,
    jsonb_build_object('scheduledAt', previous_at),
    jsonb_build_object('scheduledAt', p_scheduled_at, 'notes', p_notes),
    p_idempotency_key
  );
  return true;
end;
$$;
revoke all on function public.reschedule_delivery(uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.reschedule_delivery(uuid, uuid, timestamptz, text, text) to authenticated;

-- Cancel once, restock once, and prevent replay double-restocking.
create or replace function public.cancel_sale_with_restock(
  p_organization_id uuid,
  p_sale_id uuid,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  sale_row public.sales;
  cancellation public.sale_cancellations;
  item_row public.sale_items;
  product_row public.products;
  next_quantity numeric(18,3);
begin
  if not public.is_staff(p_organization_id) then raise exception 'Administrator access denied'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;

  select * into cancellation
  from public.sale_cancellations
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('sale_id', p_sale_id, 'cancelled', true, 'idempotent', true);
  end if;

  select * into sale_row
  from public.sales
  where organization_id = p_organization_id and id = p_sale_id
  for update;
  if not found then raise exception 'Sale not found'; end if;
  if sale_row.fulfillment_status = 'cancelled' then
    return jsonb_build_object('sale_id', p_sale_id, 'cancelled', true, 'idempotent', true);
  end if;
  if sale_row.fulfillment_status = 'delivered' then raise exception 'Delivered sales cannot be cancelled'; end if;

  insert into public.sale_cancellations (
    organization_id, sale_id, idempotency_key, reason, actor_user_id
  ) values (
    p_organization_id, p_sale_id, p_idempotency_key,
    nullif(trim(coalesce(p_reason, '')), ''), auth.uid()
  );

  for item_row in
    select * from public.sale_items
    where organization_id = p_organization_id and sale_id = p_sale_id
  loop
    if item_row.product_id is not null then
      select * into product_row
      from public.products
      where organization_id = p_organization_id and id = item_row.product_id
      for update;
      if found then
        next_quantity := product_row.quantity + item_row.quantity;
        perform set_config('saga.stock_operation', 'true', true);
        update public.products
        set quantity = next_quantity
        where organization_id = p_organization_id and id = product_row.id;
        insert into public.stock_movements (
          organization_id, product_id, movement_type, quantity,
          previous_quantity, new_quantity, reference_type, reference_id,
          reason, actor_user_id
        ) values (
          p_organization_id, product_row.id, 'cancellation', item_row.quantity,
          product_row.quantity, next_quantity, 'sale_cancellation', p_sale_id,
          'Cancelled sale stock restock', auth.uid()
        );
      end if;
    end if;
  end loop;

  update public.delivery_assignments
  set status = 'cancelled', updated_at = now()
  where organization_id = p_organization_id and sale_id = p_sale_id;

  update public.sales
  set fulfillment_status = 'cancelled'::public.fulfillment_status,
      amount_due = greatest(total_amount - confirmed_paid_amount, 0),
      payment_status = case
        when confirmed_paid_amount >= total_amount then 'paid'
        when confirmed_paid_amount > 0 then 'partial'
        else 'unpaid'
      end
  where organization_id = p_organization_id and id = p_sale_id;

  update public.sale_cancellations
  set restocked_at = now()
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    p_organization_id, auth.uid(), 'sale_cancelled', 'sale', p_sale_id,
    to_jsonb(sale_row),
    jsonb_build_object('cancelled', true, 'restocked', true, 'reason', p_reason),
    p_idempotency_key
  );

  return jsonb_build_object('sale_id', p_sale_id, 'cancelled', true, 'restocked', true, 'idempotent', false);
end;
$$;
revoke all on function public.cancel_sale_with_restock(uuid, uuid, text, text) from public;
grant execute on function public.cancel_sale_with_restock(uuid, uuid, text, text) to authenticated;
