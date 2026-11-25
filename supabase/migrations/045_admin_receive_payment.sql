-- Enforce the single-admin policy on the existing definer RPCs.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.cancel_sale_with_restock(uuid,uuid,text,text)'::regprocedure) into function_definition;
  function_definition := replace(function_definition, 'if not public.is_staff(p_organization_id)', 'if not public.is_admin(p_organization_id)');
  execute function_definition;
  select pg_get_functiondef('public.reschedule_delivery(uuid,uuid,timestamptz,text,text)'::regprocedure) into function_definition;
  function_definition := replace(function_definition, 'if not public.is_staff(p_organization_id)', 'if not public.is_admin(p_organization_id)');
  execute function_definition;
end;
$$;

create or replace function public.receive_sale_payment(
  p_organization_id uuid,
  p_sale_id uuid,
  p_amount numeric,
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
  existing_payment public.payments%rowtype;
  paid_before numeric(18,2);
  due_before numeric(18,2);
  amount_value numeric(18,2);
  paid_after numeric(18,2);
  due_after_value numeric(18,2);
  status_value public.payment_status;
  payment_id uuid;
begin
  if not public.is_admin(p_organization_id) then raise exception 'Administrator access is required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;
  amount_value := round(coalesce(p_amount, 0), 2);
  if amount_value <= 0 then raise exception 'Payment amount must be positive'; end if;

  select * into existing_payment
  from public.payments
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    select * into sale_row from public.sales where organization_id = p_organization_id and id = p_sale_id;
    return jsonb_build_object('payment_id', existing_payment.id, 'amount_paid', sale_row.confirmed_paid_amount, 'amount_due', sale_row.amount_due, 'payment_status', sale_row.payment_status, 'idempotent', true);
  end if;

  select * into sale_row
  from public.sales
  where organization_id = p_organization_id and id = p_sale_id
  for update;
  if not found then raise exception 'Sale not found'; end if;
  if sale_row.fulfillment_status = 'cancelled' then raise exception 'Cancelled orders cannot receive payments'; end if;

  paid_before := coalesce(sale_row.confirmed_paid_amount, sale_row.amount_paid, 0);
  due_before := greatest(round(sale_row.total_amount - paid_before, 2), 0);
  if amount_value > due_before then raise exception 'Payment amount exceeds due'; end if;
  paid_after := least(round(paid_before + amount_value, 2), sale_row.total_amount);
  due_after_value := greatest(round(sale_row.total_amount - paid_after, 2), 0);
  if due_after_value = 0 then status_value := 'paid';
  elsif paid_after > 0 then status_value := 'partial';
  else status_value := 'unpaid'; end if;

  insert into public.payments (
    organization_id, sale_id, amount, payment_method, payment_reference,
    collected_by, collected_at, status, idempotency_key, notes
  ) values (
    p_organization_id, p_sale_id, amount_value, p_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''), auth.uid(), now(), 'completed',
    p_idempotency_key, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into payment_id;

  perform set_config('saga.sale_transaction', 'true', true);
  update public.sales
  set confirmed_paid_amount = paid_after,
      amount_paid = paid_after,
      amount_due = due_after_value,
      payment_status = status_value
  where organization_id = p_organization_id and id = p_sale_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    p_organization_id, auth.uid(), 'payment_received', 'payment', payment_id,
    jsonb_build_object('amount_paid', paid_before, 'amount_due', due_before),
    jsonb_build_object('amount_paid', paid_after, 'amount_due', due_after_value, 'amount', amount_value),
    p_idempotency_key
  );

  return jsonb_build_object('payment_id', payment_id, 'amount_paid', paid_after, 'amount_due', due_after_value, 'payment_status', status_value, 'idempotent', false);
end;
$$;

revoke all on function public.receive_sale_payment(uuid, uuid, numeric, public.payment_method, text, text, text) from public;
grant execute on function public.receive_sale_payment(uuid, uuid, numeric, public.payment_method, text, text, text) to authenticated;
