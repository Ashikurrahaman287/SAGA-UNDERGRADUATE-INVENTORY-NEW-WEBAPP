alter table public.delivery_done_events
  add column if not exists delivery_email_started_at timestamptz,
  add column if not exists delivery_email_sent_at timestamptz;

create or replace function public.claim_delivery_done_email(
  p_organization_id uuid,
  p_sale_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_admin(p_organization_id) then
    raise exception 'Administrator access is required';
  end if;

  update public.delivery_done_events
  set delivery_email_started_at = now()
  where organization_id = p_organization_id
    and sale_id = p_sale_id
    and delivery_email_sent_at is null
    and (
      delivery_email_started_at is null
      or delivery_email_started_at < now() - interval '10 minutes'
    );

  return found;
end;
$$;

create or replace function public.complete_delivery_done_email(
  p_organization_id uuid,
  p_sale_id uuid,
  p_sent boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_admin(p_organization_id) then
    raise exception 'Administrator access is required';
  end if;

  update public.delivery_done_events
  set delivery_email_sent_at = case when p_sent then now() else null end,
      delivery_email_started_at = null
  where organization_id = p_organization_id and sale_id = p_sale_id;

  return found;
end;
$$;

revoke all on function public.claim_delivery_done_email(uuid, uuid) from public;
revoke all on function public.complete_delivery_done_email(uuid, uuid, boolean) from public;
grant execute on function public.claim_delivery_done_email(uuid, uuid) to authenticated;
grant execute on function public.complete_delivery_done_email(uuid, uuid, boolean) to authenticated;
