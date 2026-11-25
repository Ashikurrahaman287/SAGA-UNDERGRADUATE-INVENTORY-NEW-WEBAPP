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
  next_fulfillment_status public.fulfillment_status;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':packaging:' || p_sale_id::text || ':' || p_idempotency_key, 0));
  perform set_config('saga.fulfillment_transaction', 'true', true);
  if not public.is_staff(p_organization_id) then raise exception 'Fulfillment access denied'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;

  select * into existing_request
  from public.fulfillment_requests f
  where f.organization_id = p_organization_id
    and f.operation = 'packaging_transition'
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

  select * into packaging_row
  from public.packaging_records r
  where r.organization_id = p_organization_id and r.sale_id = p_sale_id
  for update;
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

  insert into public.packaging_events (
    organization_id, packaging_record_id, previous_status, new_status, actor_user_id
  ) values (
    p_organization_id, packaging_row.id, packaging_row.packaging_status,
    p_new_status, auth.uid()
  );

  update public.packaging_records
  set packaging_status = p_new_status,
      packaging_cost = coalesce(p_packaging_cost, packaging_cost),
      packed_by = case when p_new_status = 'packed' then auth.uid() else packed_by end,
      packed_at = case when p_new_status = 'packed' then now() else packed_at end,
      ready_at = case when p_new_status = 'ready' then now() else ready_at end
  where id = packaging_row.id;

  if p_new_status = 'ready' then
    next_fulfillment_status := 'ready_for_delivery'::public.fulfillment_status;
  elsif p_new_status = 'packed' then
    next_fulfillment_status := 'packed'::public.fulfillment_status;
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
    p_organization_id, auth.uid(), 'packaging_transition', 'sale', p_sale_id,
    jsonb_build_object('packaging_status', packaging_row.packaging_status),
    jsonb_build_object('packaging_status', p_new_status),
    p_request_hash
  );

  insert into public.fulfillment_requests (
    organization_id, idempotency_key, operation, request_hash, sale_id, response_data
  ) values (
    p_organization_id, p_idempotency_key, 'packaging_transition', p_request_hash, p_sale_id,
    jsonb_build_object('sale_id', p_sale_id, 'packaging_status', p_new_status)
  );

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'packaging_status', p_new_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.transition_packaging(uuid, uuid, public.packaging_status, numeric, text, text) from public;
grant execute on function public.transition_packaging(uuid, uuid, public.packaging_status, numeric, text, text) to authenticated;
