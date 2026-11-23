create type public.commission_type as enum ('fixed', 'percentage');

create table public.customers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200), phone text, email text, notes text, communication_preferences jsonb not null default '{}'::jsonb,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, id)
);
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, customer_id uuid not null,
  address_line text not null, area text, city text not null, postal_code text, delivery_instructions text, is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict
);
create unique index one_default_customer_address on public.customer_addresses(organization_id, customer_id) where is_default;

create table public.sellers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200), phone text, email text, commission_type public.commission_type,
  commission_value numeric(18,2) check (commission_value is null or commission_value >= 0), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, receipt_number text not null,
  customer_id uuid, seller_id uuid, created_by uuid references auth.users(id) on delete restrict, subtotal numeric(18,2) not null check (subtotal >= 0),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0), delivery_fee numeric(18,2) not null default 0 check (delivery_fee >= 0),
  total_amount numeric(18,2) not null check (total_amount >= 0), amount_paid numeric(18,2) not null default 0 check (amount_paid >= 0),
  amount_due numeric(18,2) not null check (amount_due >= 0), payment_status public.payment_status not null default 'unpaid',
  fulfillment_status public.fulfillment_status not null default 'pending', delivery_address_snapshot jsonb, payment_method public.payment_method, notes text,
  idempotency_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, id), unique (organization_id, receipt_number), unique (organization_id, idempotency_key),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, seller_id) references public.sellers(organization_id, id) on delete restrict,
  check (amount_due = total_amount - amount_paid), check (amount_paid <= total_amount)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, sale_id uuid not null, product_id uuid,
  product_name_snapshot text not null, sku_snapshot text not null, quantity numeric(18,3) not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0),
  unit_cost_snapshot numeric(18,2) not null check (unit_cost_snapshot >= 0), discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0), line_total numeric(18,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict,
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete restrict
);
create table public.sale_idempotency (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  idempotency_key text not null, request_hash text not null, response_reference uuid, created_at timestamptz not null default now(), unique (organization_id, idempotency_key)
);

create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger customer_addresses_updated_at before update on public.customer_addresses for each row execute function public.set_updated_at();
create trigger sellers_updated_at before update on public.sellers for each row execute function public.set_updated_at();
create trigger sales_updated_at before update on public.sales for each row execute function public.set_updated_at();
