-- Complete all non-cancelled active delivery assignments.
update public.delivery_assignments d
set status = 'delivered', delivered_at = coalesce(d.delivered_at, now())
where d.status in ('assigned', 'out_for_delivery')
  and d.rider_user_id is not null;

update public.sales s
set fulfillment_status = 'delivered'::public.fulfillment_status
from public.delivery_assignments d
where d.organization_id = s.organization_id
  and d.sale_id = s.id
  and d.status = 'delivered'
  and s.fulfillment_status <> 'cancelled';

update public.packaging_records p
set packaging_status = 'ready',
    packed_at = coalesce(p.packed_at, now()),
    ready_at = coalesce(p.ready_at, now())
from public.sales s
where s.organization_id = p.organization_id
  and s.id = p.sale_id
  and s.fulfillment_status = 'delivered';
