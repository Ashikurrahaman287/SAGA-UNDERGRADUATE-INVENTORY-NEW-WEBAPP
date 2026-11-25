grant select on public.delivery_done_events to authenticated;
drop policy if exists delivery_done_event_admin_read on public.delivery_done_events;
create policy delivery_done_event_admin_read on public.delivery_done_events
for select to authenticated
using (public.is_admin(organization_id));
