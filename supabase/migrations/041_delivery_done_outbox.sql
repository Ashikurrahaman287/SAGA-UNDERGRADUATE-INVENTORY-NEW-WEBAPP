-- The RPCs perform explicit Admin checks; run their multi-table transactions as the owner.
alter function public.reschedule_delivery(uuid, uuid, timestamptz, text, text) security definer;
alter function public.reschedule_delivery(uuid, uuid, timestamptz, text, text) set search_path = pg_catalog, public, auth;
alter function public.cancel_sale_with_restock(uuid, uuid, text, text) security definer;
alter function public.cancel_sale_with_restock(uuid, uuid, text, text) set search_path = pg_catalog, public, auth;

alter table public.delivery_done_events
  add column if not exists payment_sms_started_at timestamptz,
  add column if not exists payment_sms_sent_at timestamptz,
  add column if not exists delivery_sms_started_at timestamptz,
  add column if not exists delivery_sms_sent_at timestamptz;

create or replace function public.claim_delivery_done_sms(
  p_organization_id uuid,
  p_sale_id uuid,
  p_kind text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  claimed boolean := false;
begin
  if not public.is_admin(p_organization_id) then raise exception 'Administrator access is required'; end if;
  if p_kind = 'payment' then
    update public.delivery_done_events
    set payment_sms_started_at = now()
    where organization_id = p_organization_id and sale_id = p_sale_id
      and payment_sms_sent_at is null and payment_sms_started_at is null;
  elsif p_kind = 'delivery' then
    update public.delivery_done_events
    set delivery_sms_started_at = now()
    where organization_id = p_organization_id and sale_id = p_sale_id
      and delivery_sms_sent_at is null and delivery_sms_started_at is null;
  else
    raise exception 'Invalid notification kind';
  end if;
  claimed := found;
  return claimed;
end;
$$;

create or replace function public.complete_delivery_done_sms(
  p_organization_id uuid,
  p_sale_id uuid,
  p_kind text,
  p_sent boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_admin(p_organization_id) then raise exception 'Administrator access is required'; end if;
  if p_kind = 'payment' then
    update public.delivery_done_events
    set payment_sms_sent_at = case when p_sent then now() else null end,
        payment_sms_started_at = null
    where organization_id = p_organization_id and sale_id = p_sale_id;
  elsif p_kind = 'delivery' then
    update public.delivery_done_events
    set delivery_sms_sent_at = case when p_sent then now() else null end,
        delivery_sms_started_at = null
    where organization_id = p_organization_id and sale_id = p_sale_id;
  else
    raise exception 'Invalid notification kind';
  end if;
  return found;
end;
$$;

revoke all on function public.claim_delivery_done_sms(uuid, uuid, text) from public;
revoke all on function public.complete_delivery_done_sms(uuid, uuid, text, boolean) from public;
grant execute on function public.claim_delivery_done_sms(uuid, uuid, text) to authenticated;
grant execute on function public.complete_delivery_done_sms(uuid, uuid, text, boolean) to authenticated;
