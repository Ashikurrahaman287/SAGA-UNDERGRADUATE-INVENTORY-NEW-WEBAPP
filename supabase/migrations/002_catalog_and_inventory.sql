create type public.stock_movement_type as enum ('purchase', 'sale', 'return', 'cancellation', 'manual_adjustment', 'correction');

create table public.categories (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160), description text, parent_category_id uuid,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, name), unique (organization_id, id), foreign key (organization_id, parent_category_id) references public.categories(organization_id, id) on delete restrict
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200), contact_person text, phone text, email text, address text, notes text,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  category_id uuid, supplier_id uuid, name text not null check (length(trim(name)) between 1 and 200), sku text not null,
  description text, cost_price numeric(18,2) not null default 0 check (cost_price >= 0), selling_price numeric(18,2) not null check (selling_price >= 0),
  quantity numeric(18,3) not null default 0 check (quantity >= 0), low_stock_threshold numeric(18,3) not null default 0 check (low_stock_threshold >= 0),
  unit text not null default 'unit', is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, sku), unique (organization_id, id),
  foreign key (organization_id, category_id) references public.categories(organization_id, id) on delete restrict,
  foreign key (organization_id, supplier_id) references public.suppliers(organization_id, id) on delete restrict
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null, movement_type public.stock_movement_type not null, quantity numeric(18,3) not null check (quantity > 0),
  previous_quantity numeric(18,3) not null check (previous_quantity >= 0), new_quantity numeric(18,3) not null check (new_quantity >= 0),
  reference_type text, reference_id uuid, reason text not null check (length(trim(reason)) > 0), actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete restrict
);
create unique index stock_movements_reference_once on public.stock_movements(organization_id, reference_type, reference_id, movement_type) where reference_id is not null;

create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

create or replace function public.prevent_history_mutation() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Immutable history cannot be changed';
end;
$$;
create trigger stock_movements_immutable before update or delete on public.stock_movements for each row execute function public.prevent_history_mutation();
