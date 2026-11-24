alter table public.sales add column if not exists delivery_scheduled_at timestamptz;

create table if not exists public.sale_receipt_sequences (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);
alter table public.sale_receipt_sequences enable row level security;

alter type public.stock_movement_type add value if not exists 'sale';

create or replace function public.create_sale_transaction(
  p_organization_id uuid,
  p_request_hash text,
  p_idempotency_key text,
  p_customer_id uuid,
  p_seller_id uuid,
  p_discount_type text,
  p_discount_value numeric,
  p_delivery_fee numeric,
  p_payment_method public.payment_method,
  p_amount_paid numeric,
  p_payment_reference text,
  p_payment_note text,
  p_delivery_address_snapshot jsonb,
  p_delivery_scheduled_at timestamptz,
  p_notes text,
  p_items jsonb,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  existing_sale uuid;
  existing_hash text;
  sale_id uuid;
  receipt_number text;
  next_receipt bigint;
  subtotal numeric(18,2) := 0;
  discount_amount numeric(18,2) := 0;
  delivery_fee_clean numeric(18,2);
  final_total numeric(18,2);
  amount_paid_clean numeric(18,2);
  amount_due numeric(18,2);
  payment_status_value public.payment_status;
  item jsonb;
  product_row public.products;
  line_subtotal numeric(18,2);
  line_quantity numeric(18,3);
  next_quantity numeric(18,3);
  sale_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_idempotency_key, 0));
  perform set_config('saga.sale_transaction', 'true', true);
  if not public.is_staff(p_organization_id) then raise exception 'Sale access denied'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'At least one sale item is required'; end if;
  if (select count(distinct elements.value->>'product_id') from jsonb_array_elements(p_items) as elements(value)) <> jsonb_array_length(p_items) then
    raise exception 'Duplicate products are not allowed in a sale';
  end if;
  if p_discount_type not in ('fixed', 'percentage') then raise exception 'Invalid discount type'; end if;
  if coalesce(p_discount_value, 0) < 0 then raise exception 'Discount cannot be negative'; end if;
  if p_discount_type = 'percentage' and p_discount_value > 100 then raise exception 'Percentage discount cannot exceed 100'; end if;
  delivery_fee_clean := round(coalesce(p_delivery_fee, 0), 2);
  amount_paid_clean := round(coalesce(p_amount_paid, 0), 2);
  if delivery_fee_clean < 0 or amount_paid_clean < 0 then raise exception 'Payment and delivery amounts cannot be negative'; end if;

  select si.response_reference, si.request_hash
    into existing_sale, existing_hash
    from public.sale_idempotency si
   where si.organization_id = p_organization_id and si.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> p_request_hash then raise exception 'Idempotency key was used with different sale data'; end if;
    select jsonb_build_object(
      'sale_id', s.id,
      'receipt_number', s.receipt_number,
      'total_amount', s.total_amount,
      'amount_paid', s.amount_paid,
      'amount_due', s.amount_due,
      'payment_status', s.payment_status,
      'fulfillment_status', s.fulfillment_status,
      'idempotent', true
    ) into sale_result
    from public.sales s
    where s.organization_id = p_organization_id and s.id = existing_sale;
    return sale_result;
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.organization_id = p_organization_id and c.id = p_customer_id and c.is_active
  ) then raise exception 'Customer not found'; end if;

  if p_seller_id is not null and not exists (
    select 1 from public.sellers s
    where s.organization_id = p_organization_id and s.id = p_seller_id and s.is_active
  ) then raise exception 'Seller not found'; end if;

  if p_delivery_address_snapshot is not null and length(trim(coalesce(p_delivery_address_snapshot->>'address_line', ''))) = 0 then
    raise exception 'Delivery address snapshot is invalid';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    line_quantity := (item->>'quantity')::numeric;
    if line_quantity is null or line_quantity <= 0 or line_quantity <> trunc(line_quantity) then
      raise exception 'Sale quantities must be positive whole numbers';
    end if;

    select * into product_row
    from public.products p
    where p.organization_id = p_organization_id and p.id = (item->>'product_id')::uuid
    for update;

    if not found then raise exception 'Product not found'; end if;
    if not product_row.is_active then raise exception 'Inactive product cannot be sold'; end if;
    if product_row.quantity < line_quantity then raise exception 'Insufficient stock'; end if;

    next_quantity := product_row.quantity - line_quantity;
    line_subtotal := round(product_row.selling_price * line_quantity, 2);
    subtotal := subtotal + line_subtotal;

    perform set_config('saga.stock_operation', 'true', true);
    update public.products
       set quantity = next_quantity
     where organization_id = p_organization_id and id = product_row.id;

    insert into public.stock_movements (
      organization_id, product_id, movement_type, quantity,
      previous_quantity, new_quantity, reference_type, reason, actor_user_id
    ) values (
      p_organization_id, product_row.id, 'sale', line_quantity,
      product_row.quantity, next_quantity, 'sale', 'Sale stock deduction', auth.uid()
    );
  end loop;

  if p_discount_type = 'fixed' then
    discount_amount := round(p_discount_value, 2);
  else
    discount_amount := round(subtotal * p_discount_value / 100, 2);
  end if;
  if discount_amount > subtotal then raise exception 'Discount cannot exceed the sale subtotal'; end if;

  final_total := round(subtotal - discount_amount + delivery_fee_clean, 2);
  if final_total < 0 then raise exception 'Invalid final sale total'; end if;
  if amount_paid_clean > final_total then raise exception 'Payment cannot exceed the final sale total'; end if;
  amount_due := round(final_total - amount_paid_clean, 2);
  if amount_due = 0 then payment_status_value := 'paid';
  elsif amount_paid_clean > 0 then payment_status_value := 'partial';
  else payment_status_value := 'unpaid'; end if;

  insert into public.sale_receipt_sequences (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.sale_receipt_sequences.last_number + 1,
        updated_at = now()
  returning last_number into next_receipt;

  receipt_number := 'SAGA-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' || lpad(next_receipt::text, 6, '0');

  insert into public.sales (
    organization_id, receipt_number, customer_id, seller_id, created_by,
    subtotal, discount_amount, delivery_fee, total_amount, amount_paid, amount_due,
    payment_status, fulfillment_status, delivery_address_snapshot,
    delivery_scheduled_at, payment_method, notes, idempotency_key
  ) values (
    p_organization_id, receipt_number, p_customer_id, p_seller_id, auth.uid(),
    subtotal, discount_amount, delivery_fee_clean, final_total, amount_paid_clean, amount_due,
    payment_status_value, 'pending', p_delivery_address_snapshot,
    p_delivery_scheduled_at, p_payment_method, nullif(trim(coalesce(p_notes, '')), ''), p_idempotency_key
  ) returning id into sale_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    line_quantity := (item->>'quantity')::numeric;
    select * into product_row
    from public.products p
    where p.organization_id = p_organization_id and p.id = (item->>'product_id')::uuid;

    line_subtotal := round(product_row.selling_price * line_quantity, 2);
    insert into public.sale_items (
      organization_id, sale_id, product_id,
      product_name_snapshot, sku_snapshot, quantity,
      unit_price, unit_cost_snapshot, discount_amount, line_total
    ) values (
      p_organization_id, sale_id, product_row.id,
      product_row.name, product_row.sku, line_quantity,
      product_row.selling_price, product_row.cost_price,
      0, line_subtotal
    );
  end loop;

  if amount_paid_clean > 0 then
    insert into public.payments (
      organization_id, sale_id, amount, payment_method,
      payment_reference, collected_by, collected_at, status,
      idempotency_key, notes
    ) values (
      p_organization_id, sale_id, amount_paid_clean, p_payment_method,
      nullif(trim(coalesce(p_payment_reference, '')), ''), auth.uid(), now(), 'completed',
      p_idempotency_key || ':payment', nullif(trim(coalesce(p_payment_note, '')), '')
    );
  end if;

  insert into public.packaging_records (
    organization_id, sale_id, packaging_status, packaging_cost
  ) values (
    p_organization_id, sale_id, 'pending', 0
  );

  insert into public.receipts (
    organization_id, sale_id, receipt_number, snapshot
  ) values (
    p_organization_id, sale_id, receipt_number,
    jsonb_build_object(
      'subtotal', subtotal, 'discount_amount', discount_amount,
      'delivery_fee', delivery_fee_clean, 'total_amount', final_total,
      'amount_paid', amount_paid_clean, 'amount_due', amount_due,
      'payment_status', payment_status_value
    )
  );

  insert into public.sale_idempotency (
    organization_id, idempotency_key, request_hash, response_reference
  ) values (
    p_organization_id, p_idempotency_key, p_request_hash, sale_id
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    p_organization_id, auth.uid(), 'sale_created', 'sale', sale_id,
    null, jsonb_build_object('receipt_number', receipt_number, 'total_amount', final_total),
    p_request_id
  );

  select jsonb_build_object(
    'sale_id', s.id,
    'receipt_number', s.receipt_number,
    'subtotal', s.subtotal,
    'discount_amount', s.discount_amount,
    'delivery_fee', s.delivery_fee,
    'total_amount', s.total_amount,
    'amount_paid', s.amount_paid,
    'amount_due', s.amount_due,
    'payment_status', s.payment_status,
    'fulfillment_status', s.fulfillment_status,
    'idempotent', false
  ) into sale_result
  from public.sales s
  where s.id = sale_id and s.organization_id = p_organization_id;

  return sale_result;
end;
$$;

revoke all on function public.create_sale_transaction(uuid, text, text, uuid, uuid, text, numeric, numeric, public.payment_method, numeric, text, text, jsonb, timestamptz, text, jsonb, text) from public;
grant execute on function public.create_sale_transaction(uuid, text, text, uuid, uuid, text, numeric, numeric, public.payment_method, numeric, text, text, jsonb, timestamptz, text, jsonb, text) to authenticated;

drop policy if exists sales_staff_write on public.sales;
create policy sales_rpc_only on public.sales for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true');

drop policy if exists sale_items_staff_write on public.sale_items;
create policy sale_items_rpc_only on public.sale_items for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true');

drop policy if exists payments_staff_write on public.payments;
create policy payments_rpc_only on public.payments for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true');

drop policy if exists receipts_staff_insert on public.receipts;
create policy receipts_rpc_only on public.receipts for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true');

drop policy if exists packaging_staff_access on public.packaging_records;
create policy packaging_staff_read on public.packaging_records for select to authenticated
using (public.is_staff(organization_id));
create policy packaging_rpc_only on public.packaging_records for insert to authenticated
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true');

drop policy if exists idempotency_staff_write on public.sale_idempotency;
create policy sale_idempotency_rpc_only on public.sale_idempotency for all to authenticated
using (public.is_staff(organization_id) and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true')
with check (public.is_staff(organization_id) and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true');

create or replace function public.prevent_direct_sale_mutation() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if coalesce(current_setting('saga.sale_transaction', true), 'false') <> 'true' then
    if new.organization_id is distinct from old.organization_id or new.receipt_number is distinct from old.receipt_number
       or new.subtotal is distinct from old.subtotal or new.discount_amount is distinct from old.discount_amount
       or new.delivery_fee is distinct from old.delivery_fee or new.total_amount is distinct from old.total_amount
       or new.amount_paid is distinct from old.amount_paid or new.amount_due is distinct from old.amount_due
       or new.payment_status is distinct from old.payment_status or new.customer_id is distinct from old.customer_id
       or new.seller_id is distinct from old.seller_id or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'Sale financial and attribution fields must not be changed directly';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sales_direct_mutation_guard on public.sales;
create trigger sales_direct_mutation_guard before update on public.sales for each row execute function public.prevent_direct_sale_mutation();
