create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  receipt_number text not null,
  issued_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sale_id),
  unique (organization_id, receipt_number),
  foreign key (organization_id, sale_id) references public.sales(organization_id, id) on delete restrict
);

create index receipts_org_issued on public.receipts(organization_id, issued_at desc);
alter table public.receipts enable row level security;

create policy receipts_staff_read on public.receipts
for select to authenticated
using (public.is_staff(organization_id));

create policy receipts_staff_insert on public.receipts
for insert to authenticated
with check (public.is_staff(organization_id));
