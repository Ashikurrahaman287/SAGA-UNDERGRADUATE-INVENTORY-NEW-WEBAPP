-- Normalize legacy/test fulfillment states so records cannot become stuck in conflicting statuses.
update public.packaging_records p
set packaging_status = 'ready',
    packed_at = coalesce(p.packed_at, now()),
    ready_at = coalesce(p.ready_at, now())
from public.sales s
where s.organization_id = p.organization_id
  and s.id = p.sale_id
  and s.fulfillment_status = 'delivered'
  and p.packaging_status <> 'ready';

-- Keep direct updates consistent with the sale lifecycle.
create or replace function public.sync_delivery_to_fulfillment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'delivered' then
    update public.sales
    set fulfillment_status = 'delivered'::public.fulfillment_status
    where organization_id = new.organization_id and id = new.sale_id;
  elsif new.status = 'out_for_delivery' then
    update public.sales
    set fulfillment_status = 'out_for_delivery'::public.fulfillment_status
    where organization_id = new.organization_id and id = new.sale_id;
  elsif new.status = 'cancelled' then
    update public.sales
    set fulfillment_status = 'cancelled'::public.fulfillment_status
    where organization_id = new.organization_id and id = new.sale_id;
  elsif new.status = 'assigned' then
    update public.sales
    set fulfillment_status = 'processing'::public.fulfillment_status
    where organization_id = new.organization_id and id = new.sale_id;
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_assignment_sync_fulfillment on public.delivery_assignments;
create trigger delivery_assignment_sync_fulfillment
after insert or update of status on public.delivery_assignments
for each row execute function public.sync_delivery_to_fulfillment();
