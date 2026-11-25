-- Single-admin packaging cost and due state.
alter table public.sales
  add column if not exists internal_packaging_cost numeric(18,2) not null default 0 check (internal_packaging_cost >= 0);

alter table public.sales
  add column if not exists confirmed_paid_amount numeric(18,2) not null default 0 check (confirmed_paid_amount >= 0);

-- Reconcile persisted confirmed payments without changing legacy sales.
update public.sales s
set confirmed_paid_amount = greatest(coalesce((
  select sum(p.amount)
  from public.payments p
  where p.organization_id = s.organization_id
    and p.sale_id = s.id
    and p.status = 'completed'
), s.amount_paid), 0)
where s.confirmed_paid_amount = 0;

update public.sales s
set amount_due = greatest(s.total_amount - s.confirmed_paid_amount, 0)
where s.confirmed_paid_amount > 0;

alter table public.sales
  add constraint sales_confirmed_paid_limit check (confirmed_paid_amount <= total_amount);

-- Delivery reschedule and cancellation audit history.
create table if not exists public.delivery_reschedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  previous_scheduled_at timestamptz,
  scheduled_at timestamptz not null,
  notes text,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
alter table public.delivery_reschedules enable row level security;
create index if not exists delivery_reschedules_org_sale on public.delivery_reschedules(organization_id, sale_id, created_at desc);

create table if not exists public.sale_cancellations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  idempotency_key text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete restrict,
  restocked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
alter table public.sale_cancellations enable row level security;
create index if not exists sale_cancellations_org_sale on public.sale_cancellations(organization_id, sale_id);

-- Operational cost edit audit support.
alter table public.operational_costs
  add column if not exists label text;
alter table public.operational_costs
  add column if not exists category text;
alter table public.operational_costs
  add column if not exists notes text;

-- Net profit: gross profit - operational costs - packaging cost.
create or replace function public.get_net_profit(
  p_organization_id uuid,
  p_start timestamptz,
  p_end timestamptz
) returns numeric(18,2)
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
  with valid_sales as (
    select s.*
    from public.sales s
    where s.organization_id = p_organization_id
      and s.created_at >= p_start
      and s.created_at < p_end
      and s.fulfillment_status <> 'cancelled'
  ), gross as (
    select coalesce(sum(si.line_total - (si.unit_cost_snapshot * si.quantity)), 0)
    from public.sale_items si
    join valid_sales s on s.id = si.sale_id and s.organization_id = si.organization_id
  ), costs as (
    select coalesce(sum(o.amount), 0)
    from public.operational_costs o
    where o.organization_id = p_organization_id
      and o.expense_date >= (p_start at time zone 'UTC')::date
      and o.expense_date < (p_end at time zone 'UTC')::date
  ), packaging as (
    select coalesce(sum(s.internal_packaging_cost), 0)
    from valid_sales s
  )
  select round((select * from gross) - (select * from costs) - (select * from packaging), 2);
$$;
revoke all on function public.get_net_profit(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_net_profit(uuid, timestamptz, timestamptz) to authenticated;
