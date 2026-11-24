create or replace function public.reserve_communication_send(
  p_organization_id uuid,
  p_idempotency_key text,
  p_channel text,
  p_label text,
  p_template_type text,
  p_recipient text,
  p_customer_id uuid,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = pg_catalog, public, auth as $$
declare
  existing_log uuid;
  log_id uuid;
begin
  if not public.is_admin(p_organization_id) then raise exception 'Communication access denied'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'A valid idempotency key is required'; end if;
  if p_channel not in ('sms', 'email') or p_label not in ('transactional', 'promotional') then raise exception 'Invalid communication type'; end if;

  select id into existing_log
  from public.communication_logs
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key and recipient = p_recipient;
  if found then return existing_log; end if;

  insert into public.communication_logs (
    organization_id, customer_id, channel, label, template_type, recipient,
    related_entity_type, related_entity_id, idempotency_key,
    delivery_status, sent_by, triggered_by
  ) values (
    p_organization_id, p_customer_id, p_channel, p_label, p_template_type, p_recipient,
    p_related_entity_type, p_related_entity_id, p_idempotency_key,
    'queued', auth.uid(), auth.uid()
  ) returning id into log_id;
  return log_id;
end;
$$;
revoke all on function public.reserve_communication_send(uuid, text, text, text, text, text, uuid, text, uuid) from public;
grant execute on function public.reserve_communication_send(uuid, text, text, text, text, text, uuid, text, uuid) to authenticated;

create or replace function public.complete_communication_send(
  p_organization_id uuid,
  p_log_id uuid,
  p_status text,
  p_provider_error_code text,
  p_provider_message_id text,
  p_provider_response jsonb
) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public, auth as $$
begin
  if not public.is_admin(p_organization_id) then raise exception 'Communication access denied'; end if;
  if p_status not in ('queued', 'sent', 'delivered', 'failed', 'rejected_consent') then raise exception 'Invalid communication status'; end if;
  update public.communication_logs
  set delivery_status = p_status,
      provider_error_code = nullif(p_provider_error_code, ''),
      provider_message_id = nullif(p_provider_message_id, ''),
      provider_response = p_provider_response,
      sent_at = case when p_status in ('sent', 'delivered') then now() else sent_at end
  where organization_id = p_organization_id and id = p_log_id;
  return found;
end;
$$;
revoke all on function public.complete_communication_send(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.complete_communication_send(uuid, uuid, text, text, text, jsonb) to authenticated;
