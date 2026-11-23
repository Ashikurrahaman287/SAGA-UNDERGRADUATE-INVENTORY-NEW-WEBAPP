create type public.packaging_status as enum ('pending', 'in_progress', 'packed', 'ready');
create type public.delivery_status as enum ('unassigned', 'assigned', 'out_for_delivery', 'delivered', 'failed', 'cancelled');

create table public.payments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, sale_id uuid not null,
  amount numeric(18,2) not null check (amount > 0), payment_method public.payment_method not null, payment_reference text, collected_by uuid references auth.users(id) on delete restrict,
  collected_at timestamptz not null default now(), status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'voided')),
  idempotency_key text not null, notes text, created_at timestamptz not null default now(), unique (organization_id, id), unique (organization_id, idempotency_key),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
create table public.packaging_records (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, sale_id uuid not null,
  packaging_status public.packaging_status not null default 'pending', packaging_cost numeric(18,2) not null default 0 check (packaging_cost >= 0), packed_by uuid references auth.users(id) on delete restrict,
  packed_at timestamptz, ready_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, sale_id), unique (organization_id, id),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
create table public.packaging_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, packaging_record_id uuid not null,
  previous_status public.packaging_status, new_status public.packaging_status not null, actor_user_id uuid references auth.users(id) on delete restrict, created_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, packaging_record_id) references public.packaging_records(organization_id, id) on delete restrict
);
create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, sale_id uuid not null,
  rider_user_id uuid references auth.users(id) on delete restrict, assigned_by uuid references auth.users(id) on delete restrict, status public.delivery_status not null default 'unassigned',
  scheduled_at timestamptz, assigned_at timestamptz, delivered_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, sale_id), unique (organization_id, id),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
create table public.delivery_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, delivery_assignment_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete restrict, previous_status public.delivery_status, new_status public.delivery_status not null,
  collection_amount numeric(18,2) check (collection_amount is null or collection_amount >= 0), payment_method public.payment_method, notes text, created_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, delivery_assignment_id) references public.delivery_assignments(organization_id, id) on delete restrict
);
create trigger packaging_updated_at before update on public.packaging_records for each row execute function public.set_updated_at();
create trigger delivery_updated_at before update on public.delivery_assignments for each row execute function public.set_updated_at();
