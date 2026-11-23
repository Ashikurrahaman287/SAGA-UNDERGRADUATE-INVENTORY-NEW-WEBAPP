create table public.returns (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, sale_id uuid not null, return_number text not null,
  reason text not null, status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'processed', 'cancelled')),
  approved_by uuid references auth.users(id) on delete restrict, created_by uuid references auth.users(id) on delete restrict, restock_decision text not null default 'restock' check (restock_decision in ('restock', 'discard')),
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, id), unique (organization_id, return_number),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);
create table public.return_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, return_id uuid not null, sale_item_id uuid not null,
  quantity numeric(18,3) not null check (quantity > 0), refund_amount numeric(18,2) not null check (refund_amount >= 0), created_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, return_id) references public.returns(organization_id, id) on delete restrict,
  foreign key (organization_id, sale_item_id) references public.sale_items(organization_id, id) on delete restrict
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, return_id uuid not null,
  amount numeric(18,2) not null check (amount > 0), refund_method public.payment_method not null, reason text not null, approved_by uuid references auth.users(id) on delete restrict,
  processed_by uuid references auth.users(id) on delete restrict, idempotency_key text not null, status text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'voided')),
  created_at timestamptz not null default now(), unique (organization_id, id), unique (organization_id, idempotency_key), foreign key (organization_id, return_id) references public.returns(organization_id, id) on delete restrict
);
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, name text not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, name), unique (organization_id, id)
);
create table public.operational_costs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, category_id uuid not null, amount numeric(18,2) not null check (amount > 0),
  description text not null, expense_date date not null, created_by uuid references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, id),
  foreign key (organization_id, category_id) references public.expense_categories(organization_id, id) on delete restrict
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, actor_user_id uuid references auth.users(id) on delete restrict,
  action text not null, entity_type text not null, entity_id uuid, before_data jsonb, after_data jsonb, ip_address inet, request_id text, created_at timestamptz not null default now(), unique (organization_id, id)
);
create table public.communication_consents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, customer_id uuid not null, channel text not null check (channel in ('sms', 'email')),
  consent_status text not null check (consent_status in ('granted', 'denied', 'unknown')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, customer_id, channel), unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict
);
create table public.communication_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, customer_id uuid, channel text not null check (channel in ('sms', 'email')),
  template_type text not null, recipient text not null, provider_reference text, delivery_status text not null check (delivery_status in ('queued', 'sent', 'delivered', 'failed')), error_code text,
  sent_by uuid references auth.users(id) on delete restrict, sent_at timestamptz, created_at timestamptz not null default now(), unique (organization_id, id), foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict
);
create trigger returns_updated_at before update on public.returns for each row execute function public.set_updated_at();
create trigger expense_categories_updated_at before update on public.expense_categories for each row execute function public.set_updated_at();
create trigger operational_costs_updated_at before update on public.operational_costs for each row execute function public.set_updated_at();
create trigger communication_consents_updated_at before update on public.communication_consents for each row execute function public.set_updated_at();
