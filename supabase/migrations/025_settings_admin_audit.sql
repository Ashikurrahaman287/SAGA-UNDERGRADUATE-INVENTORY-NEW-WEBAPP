alter table public.organizations
  add column if not exists business_address text;

alter table public.business_settings
  add column if not exists receipt_header text,
  add column if not exists receipt_footer text,
  add column if not exists receipt_notes text;

alter table public.memberships
  add column if not exists rider_eligible boolean not null default false;

update public.memberships
set rider_eligible = true
where role = 'rider' and is_active and rider_eligible = false;

alter table public.memberships
  add constraint memberships_rider_eligibility_role
  check (not rider_eligible or (role = 'rider' and is_active)) not valid;

alter table public.memberships
  validate constraint memberships_rider_eligibility_role;

alter table public.audit_logs
  add column if not exists actor_role public.app_role,
  add column if not exists event_category text,
  add column if not exists entity_reference text;

alter table public.audit_logs
  add constraint audit_logs_event_category_check
  check (event_category is null or event_category in (
    'auth', 'role_change', 'product_stock', 'sale', 'payment', 'delivery',
    'return', 'settings', 'communication'
  )) not valid;

alter table public.audit_logs
  validate constraint audit_logs_event_category_check;

create index if not exists memberships_org_rider_eligible
  on public.memberships (organization_id, user_id)
  where role = 'rider' and is_active and rider_eligible;

create index if not exists audit_logs_org_created
  on public.audit_logs (organization_id, created_at desc, id desc);

create index if not exists audit_logs_org_actor_created
  on public.audit_logs (organization_id, actor_user_id, created_at desc);

create index if not exists audit_logs_org_category_created
  on public.audit_logs (organization_id, event_category, created_at desc);

create or replace function public.redact_audit_json(p_value jsonb)
returns jsonb
language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    select coalesce(jsonb_object_agg(entry.key,
      case
        when entry.key ~* '(password|secret|token|apikey|api_key|authorization|cookie|service.role)'
          then to_jsonb('[REDACTED]'::text)
        else public.redact_audit_json(entry.value)
      end
    ), '{}'::jsonb)
    into result
    from jsonb_each(p_value) as entry;
    return result;
  elsif jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(public.redact_audit_json(value)), '[]'::jsonb)
    into result
    from jsonb_array_elements(p_value) as item(value);
    return result;
  end if;
  return p_value;
end;
$$;

create or replace function public.prepare_audit_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.before_data := public.redact_audit_json(new.before_data);
  new.after_data := public.redact_audit_json(new.after_data);
  if new.actor_role is null and new.actor_user_id is not null and new.organization_id is not null then
    select m.role into new.actor_role
    from public.memberships m
    where m.organization_id = new.organization_id and m.user_id = new.actor_user_id;
  end if;
  if new.event_category is null then
    new.event_category := case
      when new.entity_type = 'authentication' then 'auth'
      when new.entity_type in ('membership', 'role_change', 'user') then 'role_change'
      when new.entity_type in ('product', 'stock_movement', 'inventory') then 'product_stock'
      when new.entity_type in ('sale', 'sale_item', 'receipt') then 'sale'
      when new.entity_type in ('payment', 'refund') then 'payment'
      when new.entity_type in ('delivery', 'delivery_assignment', 'packaging') then 'delivery'
      when new.entity_type in ('return', 'returns') then 'return'
      when new.entity_type in ('settings', 'organization_settings', 'organization') then 'settings'
      when new.entity_type in ('communication', 'communication_log') then 'communication'
      else null
    end;
  end if;
  return new;
end;
$$;

create trigger audit_logs_prepare_insert
before insert on public.audit_logs
for each row execute function public.prepare_audit_log();

update public.audit_logs a
set before_data = public.redact_audit_json(a.before_data),
    after_data = public.redact_audit_json(a.after_data),
    event_category = coalesce(a.event_category, case
      when a.entity_type = 'authentication' then 'auth'
      when a.entity_type in ('membership', 'role_change', 'user') then 'role_change'
      when a.entity_type in ('product', 'stock_movement', 'inventory') then 'product_stock'
      when a.entity_type in ('sale', 'sale_item', 'receipt') then 'sale'
      when a.entity_type in ('payment', 'refund') then 'payment'
      when a.entity_type in ('delivery', 'delivery_assignment', 'packaging') then 'delivery'
      when a.entity_type in ('return', 'returns') then 'return'
      when a.entity_type in ('settings', 'organization_settings', 'organization') then 'settings'
      when a.entity_type in ('communication', 'communication_log') then 'communication'
      else null
    end);

create or replace function public.reject_audit_log_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Audit log records are immutable';
end;
$$;

create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.reject_audit_log_mutation();

drop policy if exists audit_staff_insert on public.audit_logs;
create policy audit_admin_insert on public.audit_logs
for insert to authenticated
with check (public.is_admin(organization_id) and actor_user_id = auth.uid());

revoke update, delete on public.audit_logs from anon, authenticated, service_role;
grant select, insert on public.audit_logs to authenticated, service_role;

create or replace function public.enforce_membership_admin_safety()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  remaining_admins integer;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.user_id is distinct from old.user_id then
      raise exception 'Membership ownership cannot be changed';
    end if;
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      if auth.uid() is not null and not public.is_admin(old.organization_id) then
        raise exception 'Only an organization admin may change membership access';
      end if;
      if auth.uid() = old.user_id and (new.role is distinct from old.role or (old.is_active and not new.is_active)) then
        raise exception 'Admins cannot demote or deactivate their own account';
      end if;
      if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
        select count(*) into remaining_admins
        from public.memberships m
        where m.organization_id = old.organization_id
          and m.role = 'admin'
          and m.is_active
          and m.id <> old.id;
        if remaining_admins = 0 then
          raise exception 'The organization must retain one active Admin';
        end if;
      end if;
    end if;
    if new.role <> 'rider' or not new.is_active then new.rider_eligible := false; end if;
    return new;
  end if;
  if new.rider_eligible and (new.role <> 'rider' or not new.is_active) then
    raise exception 'Only active Riders can be eligible for delivery assignment';
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_guard_update on public.memberships;
drop trigger if exists membership_role_guard on public.memberships;
drop trigger if exists memberships_audit on public.memberships;
drop trigger if exists memberships_admin_safety on public.memberships;
create trigger memberships_admin_safety
before insert or update on public.memberships
for each row execute function public.enforce_membership_admin_safety();

drop policy if exists memberships_admin_manage on public.memberships;
drop policy if exists memberships_admin_insert on public.memberships;
drop policy if exists memberships_admin_update on public.memberships;
revoke insert, update, delete on public.memberships from anon, authenticated;

create or replace function public.admin_update_organization_settings(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_settings jsonb,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  before_state jsonb;
  after_state jsonb;
  threshold_value integer;
  timezone_value text;
  currency_value text;
begin
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.role = 'admin' and m.is_active
  ) then raise exception 'Administrator access is required'; end if;

  select (p_settings->>'lowStockThreshold')::integer into threshold_value;
  timezone_value := p_settings->>'timezone';
  currency_value := upper(p_settings->>'currency');
  if threshold_value < 0 or threshold_value > 100000000 then raise exception 'Invalid low-stock threshold'; end if;
  if coalesce(p_settings->>'receiptPrefix', '') !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,23}$' then
    raise exception 'Invalid receipt prefix';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = timezone_value) then
    raise exception 'Invalid business timezone';
  end if;
  if currency_value !~ '^[A-Z]{3}$' then raise exception 'Invalid currency code'; end if;

  perform 1 from public.organizations o where o.id = p_organization_id for update;
  select jsonb_build_object(
    'name', o.name, 'businessEmail', o.business_email, 'businessPhone', o.business_phone,
    'businessAddress', o.business_address, 'currency', o.currency, 'timezone', o.timezone,
    'lowStockThreshold', coalesce(s.low_stock_threshold, 0), 'receiptPrefix', coalesce(s.receipt_prefix, 'SAGA'),
    'receiptHeader', s.receipt_header, 'receiptFooter', s.receipt_footer, 'receiptNotes', s.receipt_notes,
    'notificationPreferences', coalesce(s.notification_preferences, '{}'::jsonb),
    'moderatorReturnsEnabled', coalesce(s.moderator_returns_enabled, false)
  ) into before_state
  from public.organizations o
  left join public.business_settings s on s.organization_id = o.id
  where o.id = p_organization_id;

  update public.organizations set
    name = p_settings->>'name',
    business_email = nullif(p_settings->>'businessEmail', ''),
    business_phone = nullif(p_settings->>'businessPhone', ''),
    business_address = nullif(p_settings->>'businessAddress', ''),
    currency = currency_value,
    timezone = timezone_value
  where id = p_organization_id;

  insert into public.business_settings (
    organization_id, low_stock_threshold, receipt_prefix, receipt_header,
    receipt_footer, receipt_notes, notification_preferences, moderator_returns_enabled
  ) values (
    p_organization_id, threshold_value, p_settings->>'receiptPrefix',
    nullif(p_settings->>'receiptHeader', ''), nullif(p_settings->>'receiptFooter', ''),
    nullif(p_settings->>'receiptNotes', ''), p_settings->'notificationPreferences',
    (p_settings->>'moderatorReturnsEnabled')::boolean
  ) on conflict (organization_id) do update set
    low_stock_threshold = excluded.low_stock_threshold,
    receipt_prefix = excluded.receipt_prefix,
    receipt_header = excluded.receipt_header,
    receipt_footer = excluded.receipt_footer,
    receipt_notes = excluded.receipt_notes,
    notification_preferences = excluded.notification_preferences,
    moderator_returns_enabled = excluded.moderator_returns_enabled;

  select jsonb_build_object(
    'name', o.name, 'businessEmail', o.business_email, 'businessPhone', o.business_phone,
    'businessAddress', o.business_address, 'currency', o.currency, 'timezone', o.timezone,
    'lowStockThreshold', s.low_stock_threshold, 'receiptPrefix', s.receipt_prefix,
    'receiptHeader', s.receipt_header, 'receiptFooter', s.receipt_footer, 'receiptNotes', s.receipt_notes,
    'notificationPreferences', s.notification_preferences,
    'moderatorReturnsEnabled', s.moderator_returns_enabled
  ) into after_state
  from public.organizations o join public.business_settings s on s.organization_id = o.id
  where o.id = p_organization_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id, event_category
  ) values (
    p_organization_id, p_actor_user_id, 'organization_settings_updated', 'organization_settings',
    p_organization_id, before_state, after_state, p_request_id, 'settings'
  );
  return after_state;
end;
$$;

create or replace function public.admin_update_membership(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_membership_id uuid,
  p_role public.app_role,
  p_is_active boolean,
  p_rider_eligible boolean,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.memberships%rowtype;
  before_state jsonb;
  after_state jsonb;
  new_role public.app_role;
  new_active boolean;
  new_eligible boolean;
  remaining_admins integer;
begin
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.role = 'admin' and m.is_active
  ) then raise exception 'Administrator access is required'; end if;
  perform 1 from public.organizations o where o.id = p_organization_id for update;
  select * into target from public.memberships m
  where m.organization_id = p_organization_id and m.id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;

  new_role := coalesce(p_role, target.role);
  new_active := coalesce(p_is_active, target.is_active);
  new_eligible := case
    when new_role = 'rider' and new_active then coalesce(p_rider_eligible, target.rider_eligible)
    else false
  end;
  if p_actor_user_id = target.user_id and (new_role <> target.role or (target.is_active and not new_active)) then
    raise exception 'Admins cannot demote or deactivate their own account';
  end if;
  if target.role = 'admin' and target.is_active and (new_role <> 'admin' or not new_active) then
    select count(*) into remaining_admins from public.memberships m
    where m.organization_id = p_organization_id and m.role = 'admin' and m.is_active and m.id <> target.id;
    if remaining_admins = 0 then raise exception 'The organization must retain one active Admin'; end if;
  end if;

  before_state := jsonb_build_object(
    'userId', target.user_id, 'role', target.role, 'isActive', target.is_active,
    'riderEligible', target.rider_eligible
  );
  update public.memberships set role = new_role, is_active = new_active, rider_eligible = new_eligible
  where id = target.id returning * into target;
  after_state := jsonb_build_object(
    'userId', target.user_id, 'role', target.role, 'isActive', target.is_active,
    'riderEligible', target.rider_eligible
  );
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data,
    after_data, request_id, event_category
  ) values (
    p_organization_id, p_actor_user_id, 'membership_updated', 'membership', target.id,
    before_state, after_state, p_request_id, 'role_change'
  );
  return after_state || jsonb_build_object('membershipId', target.id);
end;
$$;

create or replace function public.admin_create_membership(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_membership public.memberships%rowtype;
begin
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.role = 'admin' and m.is_active
  ) then raise exception 'Administrator access is required'; end if;
  insert into public.memberships (
    organization_id, user_id, role, is_active, rider_eligible
  ) values (
    p_organization_id, p_user_id, p_role, true, p_role = 'rider'
  ) returning * into created_membership;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id, event_category
  ) values (
    p_organization_id, p_actor_user_id, 'account_invited', 'membership',
    created_membership.id, null,
    jsonb_build_object(
      'userId', created_membership.user_id, 'role', created_membership.role,
      'isActive', created_membership.is_active,
      'riderEligible', created_membership.rider_eligible
    ),
    p_request_id, 'role_change'
  );
  return jsonb_build_object(
    'membershipId', created_membership.id,
    'userId', created_membership.user_id,
    'role', created_membership.role,
    'isActive', created_membership.is_active,
    'riderEligible', created_membership.rider_eligible
  );
end;
$$;

create or replace function public.list_admin_audit_logs(
  p_organization_id uuid,
  p_search text default null,
  p_category text default null,
  p_actor_user_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  id uuid, actor_user_id uuid, actor_name text, actor_role public.app_role,
  event_category text, action text, entity_type text, entity_id uuid,
  entity_reference text, before_data jsonb, after_data jsonb,
  created_at timestamptz, request_id text, total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then raise exception 'Invalid pagination'; end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then return; end if;
  if p_category is not null and p_category not in (
    'auth', 'role_change', 'product_stock', 'sale', 'payment', 'delivery', 'return', 'settings', 'communication'
  ) then raise exception 'Invalid event category'; end if;
  return query
    with filtered as (
      select a.*, p.full_name
      from public.audit_logs a
      left join public.profiles p on p.id = a.actor_user_id
      where a.organization_id = p_organization_id
        and (p_category is null or a.event_category = p_category)
        and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_search is null or p_search = '' or
          position(lower(p_search) in lower(concat_ws(' ', a.action, a.entity_type,
            a.entity_id::text, a.entity_reference, p.full_name, a.actor_user_id::text,
            a.before_data::text, a.after_data::text))) > 0)
    ), counted as (select count(*) as total_count from filtered)
    select f.id, f.actor_user_id, f.full_name, f.actor_role, f.event_category,
      f.action, f.entity_type, f.entity_id, f.entity_reference,
      f.before_data, f.after_data, f.created_at, f.request_id, c.total_count
    from filtered f cross join counted c
    order by f.created_at desc, f.id desc
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.admin_update_organization_settings(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_update_membership(uuid, uuid, uuid, public.app_role, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_create_membership(uuid, uuid, uuid, public.app_role, text) from public, anon, authenticated;
revoke all on function public.list_admin_audit_logs(uuid, text, text, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_update_organization_settings(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.admin_update_membership(uuid, uuid, uuid, public.app_role, boolean, boolean, text) to service_role;
grant execute on function public.admin_create_membership(uuid, uuid, uuid, public.app_role, text) to service_role;
grant execute on function public.list_admin_audit_logs(uuid, text, text, uuid, timestamptz, timestamptz, integer, integer) to service_role;

create or replace function public.require_eligible_delivery_rider()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.rider_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = new.organization_id
      and m.user_id = new.rider_user_id
      and m.role = 'rider'
      and m.is_active
      and m.rider_eligible
  ) then
    raise exception 'Delivery assignment requires an active eligible Rider';
  end if;
  return new;
end;
$$;

create trigger delivery_assignments_eligible_rider
before insert or update of rider_user_id on public.delivery_assignments
for each row execute function public.require_eligible_delivery_rider();

create or replace function public.apply_current_receipt_prefix()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  prefix_value text;
begin
  select coalesce(s.receipt_prefix, 'SAGA') into prefix_value
  from public.business_settings s
  where s.organization_id = new.organization_id;
  prefix_value := coalesce(prefix_value, 'SAGA');
  if new.receipt_number like 'SAGA-%' then
    new.receipt_number := prefix_value || substring(new.receipt_number from 5);
  end if;
  return new;
end;
$$;

create trigger sales_current_receipt_prefix
before insert on public.sales
for each row execute function public.apply_current_receipt_prefix();

create trigger receipts_current_receipt_prefix
before insert on public.receipts
for each row execute function public.apply_current_receipt_prefix();