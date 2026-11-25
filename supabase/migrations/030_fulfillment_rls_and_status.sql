-- Permit staff fulfillment RPC mutations and make backfilled delivery rows usable.
alter table public.fulfillment_requests enable row level security;
drop policy if exists fulfillment_requests_rpc_insert on public.fulfillment_requests;
create policy fulfillment_requests_rpc_insert on public.fulfillment_requests
for all to authenticated
using (
  public.is_staff(organization_id)
  and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true'
)
with check (
  public.is_staff(organization_id)
  and coalesce(current_setting('saga.fulfillment_transaction', true), 'false') = 'true'
);
grant select, insert, update on public.fulfillment_requests to authenticated;

-- Packaging and delivery operational tables used by staff/rider workflows.
drop policy if exists packaging_staff_access on public.packaging_records;
create policy packaging_staff_access on public.packaging_records
for all to authenticated
using (public.is_staff(organization_id))
with check (public.is_staff(organization_id));

drop policy if exists delivery_staff_read on public.delivery_assignments;
create policy delivery_staff_read on public.delivery_assignments
for select to authenticated
using (
  public.is_staff(organization_id)
  or (public.is_rider(organization_id) and rider_user_id = auth.uid())
);

drop policy if exists delivery_staff_insert on public.delivery_assignments;
create policy delivery_staff_insert on public.delivery_assignments
for insert to authenticated
with check (public.is_staff(organization_id));

drop policy if exists delivery_staff_update on public.delivery_assignments;
create policy delivery_staff_update on public.delivery_assignments
for update to authenticated
using (
  public.is_staff(organization_id)
  or (public.is_rider(organization_id) and rider_user_id = auth.uid())
)
with check (
  public.is_staff(organization_id)
  or (public.is_rider(organization_id) and rider_user_id = auth.uid())
);
