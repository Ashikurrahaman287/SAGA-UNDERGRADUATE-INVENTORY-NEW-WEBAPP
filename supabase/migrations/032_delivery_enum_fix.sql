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
  next_fulfillment_status public.fulfillment_status;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':delivery:' || p_sale_id::text || ':' || p_idempotency_key, 0));
  perform set_config('saga.fulfillment_transaction', 'true', true);
  if not (public.is_staff(p_organization_id) or public.is_rider(p_organization_id)) then raise exception 'Delivery access denied'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;

  select * into existing_request
  from public.fulfillment_requests f
  where f.organization_id = p_organization_id
    and f.operation = 'delivery_status'
    and f.idempotency_key = p_idempotency_key;
  if found then
    if existing_request.request_hash <> p_request_hash then raise exception 'Idempotency key was used with different data'; end if;
    return existing_request.response_data;
  end if;

  select * into sale_row
  from public.sales s
  where s.organization_id = p_organization_id and s.id = p_sale_id
  for update;
  if not found or sale_row.fulfillment_status = 'cancelled' then raise exception 'Sale unavailable'; end if;

  select * into assignment
  from public.delivery_assignments d
  where d.organization_id = p_organization_id and d.sale_id = p_sale_id
  for update;
  if not found or assignment.rider_user_id is null then raise exception 'Delivery is not assigned'; end if;
  if public.is_rider(p_organization_id) and assignment.rider_user_id <> auth.uid() then raise exception 'Delivery access denied'; end if;

  if not (
    (assignment.status = 'assigned' and p_new_status in ('out_for_delivery','failed','cancelled'))
    or (assignment.status = 'out_for_delivery' and p_new_status in ('delivered','failed'))
  ) then raise exception 'Invalid delivery transition'; end if;
  if p_new_status = 'cancelled' and not public.is_staff(p_organization_id) then raise exception 'Only staff may cancel delivery'; end if;

  insert into public.delivery_events (
    organization_id, delivery_assignment_id, actor_user_id,
    previous_status, new_status, notes
  ) values (
    p_organization_id, assignment.id, auth.uid(), assignment.status,
    p_new_status, nullif(trim(coalesce(p_notes, '')), '')
  );

  update public.delivery_assignments
  set status = p_new_status,
      delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
  where id = assignment.id;

  if p_new_status = 'delivered' then
    next_fulfillment_status := 'delivered'::public.fulfillment_status;
  elsif p_new_status = 'out_for_delivery' then
    next_fulfillment_status := 'out_for_delivery'::public.fulfillment_status;
  elsif p_new_status = 'cancelled' then
    next_fulfillment_status := 'cancelled'::public.fulfillment_status;
  else
    next_fulfillment_status := 'processing'::public.fulfillment_status;
  end if;

  update public.sales
  set fulfillment_status = next_fulfillment_status
  where id = p_sale_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    p_organization_id, auth.uid(), 'delivery_status_updated', 'sale', p_sale_id,
    jsonb_build_object('status', assignment.status),
    jsonb_build_object('status', p_new_status),
    p_request_hash
  );

  insert into public.fulfillment_requests (
    organization_id, idempotency_key, operation, request_hash, sale_id, response_data
  ) values (
    p_organization_id, p_idempotency_key, 'delivery_status', p_request_hash, p_sale_id,
    jsonb_build_object('sale_id', p_sale_id, 'status', p_new_status)
  );

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'status', p_new_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.update_delivery_status(uuid, uuid, public.delivery_status, text, text, text) from public;
grant execute on function public.update_delivery_status(uuid, uuid, public.delivery_status, text, text, text) to authenticated;
