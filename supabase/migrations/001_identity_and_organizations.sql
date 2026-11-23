create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'moderator', 'rider');
create type public.payment_status as enum ('unpaid', 'partial', 'paid', 'refunded', 'voided');
create type public.fulfillment_status as enum ('pending', 'processing', 'packed', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled');
create type public.payment_method as enum ('cash', 'card', 'bank_transfer', 'mobile_money', 'other');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  business_email text,
  business_phone text,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create table public.business_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  receipt_prefix text not null default 'SAGA',
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.memberships for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.business_settings for each row execute function public.set_updated_at();

create or replace function public.is_org_member(target_org uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select exists (select 1 from public.memberships m where m.organization_id = target_org and m.user_id = auth.uid() and m.is_active);
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select exists (select 1 from public.memberships m where m.organization_id = target_org and m.user_id = auth.uid() and m.is_active and m.role = any(allowed_roles));
$$;

create or replace function public.is_admin(target_org uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select public.has_org_role(target_org, array['admin'::public.app_role]);
$$;

create or replace function public.is_staff(target_org uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select public.has_org_role(target_org, array['admin'::public.app_role, 'moderator'::public.app_role]);
$$;

create or replace function public.is_rider(target_org uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select public.has_org_role(target_org, array['rider'::public.app_role]);
$$;

revoke all on function public.is_org_member(uuid), public.has_org_role(uuid, public.app_role[]), public.is_admin(uuid), public.is_staff(uuid), public.is_rider(uuid) from public;
grant execute on function public.is_org_member(uuid), public.has_org_role(uuid, public.app_role[]), public.is_admin(uuid), public.is_staff(uuid), public.is_rider(uuid) to authenticated;
