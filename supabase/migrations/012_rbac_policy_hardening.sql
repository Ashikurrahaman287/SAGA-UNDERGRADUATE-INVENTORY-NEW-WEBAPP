-- Memberships are deactivated rather than deleted, preserving role history and auditability.
drop policy if exists memberships_admin_manage on public.memberships;
create policy memberships_admin_insert on public.memberships for insert to authenticated
with check (public.is_admin(organization_id));
create policy memberships_admin_update on public.memberships for update to authenticated
using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));

-- A Rider may append an event only for their own active assignment.
drop policy if exists delivery_events_insert on public.delivery_events;
create policy delivery_events_insert on public.delivery_events for insert to authenticated
with check (
  public.is_staff(organization_id)
  or (
    public.is_rider(organization_id)
    and actor_user_id = auth.uid()
    and exists (
      select 1 from public.delivery_assignments d
      where d.organization_id = delivery_events.organization_id
        and d.id = delivery_events.delivery_assignment_id
        and d.rider_user_id = auth.uid()
    )
  )
);
