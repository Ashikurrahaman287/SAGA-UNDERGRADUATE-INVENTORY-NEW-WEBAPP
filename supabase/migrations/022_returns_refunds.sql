alter table public.business_settings add column if not exists moderator_returns_enabled boolean not null default false;

create table if not exists public.return_receipt_sequences (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);
alter table public.return_receipt_sequences enable row level security;
revoke all on public.return_receipt_sequences from public, anon, authenticated;

create table if not exists public.return_idempotency (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  return_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (organization_id, id)
);
alter table public.return_idempotency enable row level security;
revoke all on public.return_idempotency from public, anon, authenticated;

create index if not exists returns_org_sale_status on public.returns(organization_id, sale_id, status, created_at desc);
create index if not exists return_items_org_return on public.return_items(organization_id, return_id);
create index if not exists return_items_org_sale_item on public.return_items(organization_id, sale_item_id);
create index if not exists refunds_org_return_status on public.refunds(organization_id, return_id, status, created_at desc);

create or replace function public.moderator_returns_allowed(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select coalesce((select bs.moderator_returns_enabled from public.business_settings bs where bs.organization_id = p_organization_id), false);
$$;
revoke all on function public.moderator_returns_allowed(uuid) from public;
grant execute on function public.moderator_returns_allowed(uuid) to authenticated;

create or replace function public.create_return_transaction(
  p_organization_id uuid,
  p_sale_id uuid,
  p_request_hash text,
  p_idempotency_key text,
  p_reason text,
  p_restock_decision text,
  p_refund_method public.payment_method,
  p_refund_requested numeric,
  p_items jsonb,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  sale_row public.sales;
  existing_return_id uuid;
  existing_hash text;
  existing_result jsonb;
  return_id uuid;
  return_number text;
  return_sequence bigint;
  item jsonb;
  sale_item_row public.sale_items;
  requested_quantity numeric(18,3);
  previously_returned numeric(18,3);
  refundable_line numeric(18,2);
  sale_discount_ratio numeric;
  total_refundable numeric(18,2) := 0;
  refund_amount numeric(18,2);
  next_return_number bigint;
  previous_quantity numeric(18,3);
  next_quantity numeric(18,3);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':return:' || p_idempotency_key, 0));
  perform set_config('saga.return_transaction', 'true', true);

  if not public.is_admin(p_organization_id) then
    if not public.is_org_member(p_organization_id) then raise exception 'Return access denied'; end if;
    if not public.moderator_returns_allowed(p_organization_id) then raise exception 'Moderator returns policy disabled'; end if;
    if not public.is_staff(p_organization_id) then raise exception 'Return access denied'; end if;
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Return reason is required'; end if;
  if p_restock_decision not in ('restock', 'discard') then raise exception 'Invalid restock decision'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'At least one return item is required'; end if;

  select ri.return_id, ri.request_hash into existing_return_id, existing_hash
  from public.return_idempotency ri
  where ri.organization_id = p_organization_id and ri.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> p_request_hash then raise exception 'Idempotency key was used with different return data'; end if;
    select jsonb_build_object('return_id', r.id, 'return_number', r.return_number, 'status', r.status, 'total_amount', r.total_amount, 'idempotent', true)
    into existing_result from public.returns r
    where r.organization_id = p_organization_id and r.id = existing_return_id;
    return existing_result;
  end;

  select * into sale_row from public.sales s
  where s.organization_id = p_organization_id and s.id = p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if sale_row.fulfillment_status = 'cancelled' then raise exception 'Cancelled sales cannot be returned'; end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    requested_quantity := (item->>'quantity')::numeric;
    if requested_quantity is null or requested_quantity <= 0 or requested_quantity <> trunc(requested_quantity) then
      raise exception 'Return quantities must be positive whole numbers';
    end if;

    select * into sale_item_row from public.sale_items si
    where si.organization_id = p_organization_id and si.sale_id = p_sale_id and si.id = (item->>'sale_item_id')::uuid
    for update;
    if not found then raise exception 'Sale item not found'; end if;

    select coalesce(sum(ri.quantity), 0) into previously_returned
    from public.return_items ri
    join public.returns r on r.organization_id = ri.organization_id and r.id = ri.return_id
    where ri.organization_id = p_organization_id
      and ri.sale_item_id = sale_item_row.id
      and r.status in ('requested', 'approved', 'processed');

    if previously_returned + requested_quantity > sale_item_row.quantity then
      raise exception 'Returned quantity exceeds original sale quantity';
    end if;

    sale_discount_ratio := case when sale_row.subtotal = 0 then 0 else least(greatest(sale_row.discount_amount / sale_row.subtotal, 0), 1) end;
    refundable_line := round((sale_item_row.unit_price * requested_quantity) * (1 - sale_discount_ratio), 2);
    total_refundable := total_refundable + refundable_line;
  end loop;

  refund_amount := round(coalesce(p_refund_requested, total_refundable), 2);
  if refund_amount < 0 or refund_amount > total_refundable then raise exception 'Refund amount exceeds the maximum return value'; end if;

  insert into public.return_idempotency (organization_id, idempotency_key, request_hash)
  values (p_organization_id, p_idempotency_key, p_request_hash)
  on conflict (organization_id, idempotency_key) do nothing;

  insert into public.return_receipt_sequences (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.return_receipt_sequences.last_number + 1,
        updated_at = now()
  returning last_number into next_return_number;
  return_number := 'RET-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' || lpad(next_return_number::text, 6, '0');

  insert into public.returns (organization_id, sale_id, return_number, reason, status, approved_by, created_by, restock_decision, total_amount)
  values (p_organization_id, p_sale_id, return_number, trim(p_reason), 'approved', auth.uid(), auth.uid(), p_restock_decision, refund_amount)
  returning id into return_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    requested_quantity := (item->>'quantity')::numeric;
    select * into sale_item_row from public.sale_items si
    where si.organization_id = p_organization_id and si.sale_id = p_sale_id and si.id = (item->>'sale_item_id')::uuid;
    sale_discount_ratio := case when sale_row.subtotal = 0 then 0 else least(greatest(sale_row.discount_amount / sale_row.subtotal, 0), 1) end;
    refundable_line := round((sale_item_row.unit_price * requested_quantity) * (1 - sale_discount_ratio), 2);

    insert into public.return_items (organization_id, return_id, sale_item_id, quantity, refund_amount)
    values (p_organization_id, return_id, sale_item_row.id, requested_quantity, refundable_line);

    if p_restock_decision = 'restock' then
      select quantity into previous_quantity from public.products p
      where p.organization_id = p_organization_id and p.id = sale_item_row.product_id for update;
      if found then
        next_quantity := previous_quantity + requested_quantity;
        perform set_config('saga.stock_operation', 'true', true);
        update public.products set quantity = next_quantity
        where organization_id = p_organization_id and id = sale_item_row.product_id;
        insert into public.stock_movements (organization_id, product_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, reference_id, reason, actor_user_id)
        values (p_organization_id, sale_item_row.product_id, 'return', requested_quantity, previous_quantity, next_quantity, 'return', return_id, trim(p_reason), auth.uid());
      end if;
    end if;
  end loop;

  insert into public.refunds (organization_id, return_id, amount, refund_method, reason, approved_by, processed_by, idempotency_key, status)
  values (p_organization_id, return_id, refund_amount, p_refund_method, trim(p_reason), auth.uid(), auth.uid(), p_idempotency_key, 'processed');

  update public.sales
  set amount_paid = greatest(coalesce(amount_paid, 0) - refund_amount, 0),
      amount_due = least(total_amount, greatest(amount_due + refund_amount, 0)),
      payment_status = case
        when greatest(coalesce(amount_paid, 0) - refund_amount, 0) = 0 then 'unpaid'
        when greatest(coalesce(amount_paid, 0) - refund_amount, 0) < total_amount then 'partial'
        else 'paid'
      end
  where id = p_sale_id and organization_id = p_organization_id;

  update public.return_idempotency set return_id = return_id where organization_id = p_organization_id and idempotency_key = p_idempotency_key;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (p_organization_id, auth.uid(), 'return_processed', 'return', return_id,
    jsonb_build_object('sale_id', p_sale_id, 'status', 'none'),
    jsonb_build_object('status', 'processed', 'restock_decision', p_restock_decision, 'refund_amount', refund_amount), p_request_id);

  return jsonb_build_object('return_id', return_id, 'return_number', return_number, 'status', 'processed', 'total_amount', refund_amount, 'idempotent', false);
end;
$$;

revoke all on function public.create_return_transaction(uuid, uuid, text, text, text, text, public.payment_method, numeric, jsonb, text) from public;
grant execute on function public.create_return_transaction(uuid, uuid, text, text, text, text, public.payment_method, numeric, jsonb, text) to authenticated;

drop policy if exists returns_admin_access on public.returns;
drop policy if exists return_items_admin_access on public.return_items;
drop policy if exists refunds_admin_access on public.refunds;
create policy returns_staff_rpc_only on public.returns for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.return_transaction', true), 'false') = 'true');
create policy returns_staff_read on public.returns for select to authenticated
using (public.is_staff(organization_id));
create policy return_items_rpc_only on public.return_items for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.return_transaction', true), 'false') = 'true');
create policy return_items_staff_read on public.return_items for select to authenticated
using (public.is_staff(organization_id));
create policy refunds_rpc_only on public.refunds for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.return_transaction', true), 'false') = 'true');
create policy refunds_staff_read on public.refunds for select to authenticated
using (public.is_staff(organization_id));
