do $$
declare
  rider_id uuid := '8227db89-e3a5-4492-a562-9d257926cc7d';
begin
  if not exists (
    select 1
    from public.memberships
    where organization_id = 'c6779a77-9499-414b-994d-8cf6cee792f1'
      and user_id = rider_id
      and role = 'rider'
      and is_active
      and rider_eligible
  ) then
    raise notice 'Eligible rider membership missing; riderless deliveries were not normalized';
  else
    update public.delivery_assignments
    set rider_user_id = rider_id,
        assigned_by = coalesce(assigned_by, rider_id),
        status = 'delivered',
        assigned_at = coalesce(assigned_at, now()),
        delivered_at = coalesce(delivered_at, now())
    where organization_id = 'c6779a77-9499-414b-994d-8cf6cee792f1'
      and status in ('unassigned', 'assigned', 'out_for_delivery');

    update public.sales s
    set fulfillment_status = 'delivered'::public.fulfillment_status
    where s.organization_id = 'c6779a77-9499-414b-994d-8cf6cee792f1'
      and exists (
        select 1
        from public.delivery_assignments d
        where d.organization_id = s.organization_id
          and d.sale_id = s.id
          and d.status = 'delivered'
      )
      and s.fulfillment_status <> 'cancelled';

    update public.packaging_records p
    set packaging_status = 'ready',
        packed_at = coalesce(p.packed_at, now()),
        ready_at = coalesce(p.ready_at, now())
    where p.organization_id = 'c6779a77-9499-414b-994d-8cf6cee792f1'
      and exists (
        select 1
        from public.sales s
        where s.organization_id = p.organization_id
          and s.id = p.sale_id
          and s.fulfillment_status = 'delivered'
      );
  end if;
end;
$$;
