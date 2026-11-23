-- Development-only seed data. No auth users, passwords, production identifiers, or real customer data are created.
-- Run only against a local/staging database after applying migrations.
insert into public.organizations (name, slug, business_email, currency, timezone)
values ('SAGA Development Organization', 'saga-development', 'dev@example.invalid', 'USD', 'UTC')
on conflict (slug) do nothing;

insert into public.business_settings (organization_id)
select id from public.organizations where slug = 'saga-development'
on conflict (organization_id) do nothing;

insert into public.categories (organization_id, name, description)
select id, 'Development Category', 'Synthetic development-only category'
from public.organizations where slug = 'saga-development'
on conflict (organization_id, name) do nothing;

insert into public.suppliers (organization_id, name, notes)
select id, 'Development Supplier', 'Synthetic development-only supplier'
from public.organizations where slug = 'saga-development'
on conflict do nothing;
