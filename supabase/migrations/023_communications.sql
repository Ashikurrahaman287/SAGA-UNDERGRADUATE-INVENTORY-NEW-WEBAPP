alter table public.communication_logs drop constraint if exists communication_logs_delivery_status_check;
alter table public.communication_logs add column if not exists label text;
alter table public.communication_logs add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.communication_logs add column if not exists related_entity_type text;
alter table public.communication_logs add column if not exists related_entity_id uuid;
alter table public.communication_logs add column if not exists idempotency_key text;
alter table public.communication_logs add column if not exists provider_error_code text;
alter table public.communication_logs add column if not exists provider_message_id text;
alter table public.communication_logs add column if not exists provider_response jsonb;
alter table public.communication_logs add column if not exists triggered_by uuid references auth.users(id) on delete restrict;

alter table public.communication_logs drop constraint if exists communication_logs_delivery_status_check;
alter table public.communication_logs add constraint communication_logs_delivery_status_check
  check (delivery_status in ('queued', 'sent', 'delivered', 'failed', 'rejected_consent'));
alter table public.communication_logs add constraint communication_logs_label_check
  check (label is null or label in ('transactional', 'promotional'));

create unique index if not exists communication_logs_org_idempotency
  on public.communication_logs(organization_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists communication_logs_org_created
  on public.communication_logs(organization_id, created_at desc);
create index if not exists communication_logs_org_channel_status
  on public.communication_logs(organization_id, channel, delivery_status, created_at desc);

create table if not exists public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_type text not null check (template_type in ('receipt', 'delivery_reminder', 'cancellation', 'campaign')),
  channel text not null check (channel in ('sms', 'email')),
  label text not null check (label in ('transactional', 'promotional')),
  name text not null,
  subject text,
  content text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, channel, template_type)
);

create table if not exists public.communication_rate_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  scope_key text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope_key)
);

alter table public.communication_templates enable row level security;
alter table public.communication_rate_limits enable row level security;
revoke all on public.communication_templates, public.communication_rate_limits from public, anon, authenticated;

create or replace function public.consume_communication_rate_limit(
  p_organization_id uuid,
  p_scope_key text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, retry_after_seconds integer)
language plpgsql security invoker set search_path = pg_catalog, public, auth as $$
declare
  started timestamptz;
  attempts_count integer;
begin
  if not public.is_admin(p_organization_id) then raise exception 'Communication access denied'; end if;
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'Invalid rate limit parameters'; end if;
  insert into public.communication_rate_limits (organization_id, scope_key, window_started_at, attempts, updated_at)
  values (p_organization_id, p_scope_key, now(), 1, now())
  on conflict (organization_id, scope_key) do update set
    window_started_at = case when public.communication_rate_limits.window_started_at <= now() - (p_window_seconds * interval '1 second') then now() else public.communication_rate_limits.window_started_at end,
    attempts = case when public.communication_rate_limits.window_started_at <= now() - (p_window_seconds * interval '1 second') then 1 else public.communication_rate_limits.attempts + 1 end,
    updated_at = now();
  select r.window_started_at, r.attempts into started, attempts_count
  from public.communication_rate_limits r
  where r.organization_id = p_organization_id and r.scope_key = p_scope_key;
  return query select attempts_count <= p_limit,
    greatest(1, ceil(extract(epoch from (started + (p_window_seconds * interval '1 second') - now())))::integer);
end;
$$;
revoke all on function public.consume_communication_rate_limit(uuid, text, integer, integer) from public;
grant execute on function public.consume_communication_rate_limit(uuid, text, integer, integer) to authenticated;

create policy communication_templates_admin on public.communication_templates for all to authenticated
using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));
create policy communication_rate_limits_admin on public.communication_rate_limits for all to authenticated
using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));

revoke update, delete on public.communication_logs from authenticated;
