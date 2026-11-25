insert into public.communication_templates (
  organization_id, template_type, channel, label, name, subject, content, is_active
)
select
  o.id, template.template_type, template.channel, template.label,
  template.name, template.subject, template.content, true
from public.organizations o
cross join (values
  ('receipt', 'sms', 'transactional', 'Sale receipt', null::text, 'Thank you for your purchase. Receipt: {receiptNumber}. Total: {amount}.'),
  ('delivery_reminder', 'sms', 'transactional', 'Delivery reminder', null::text, 'Your SAGA order {receiptNumber} is scheduled for delivery. Please keep your phone available.'),
  ('cancellation', 'sms', 'transactional', 'Order cancellation', null::text, 'Your SAGA order {receiptNumber} has been cancelled. Contact us for assistance.'),
  ('campaign', 'sms', 'promotional', 'Promotional campaign', null::text, 'SAGA Inventory update: {message}')
) as template(template_type, channel, label, name, subject, content)
where template.template_type is not null
on conflict (organization_id, channel, template_type) do nothing;

grant select, insert, update on public.communication_templates to authenticated;
grant select, insert, update on public.communication_rate_limits to authenticated;
grant select, insert, update on public.communication_logs to authenticated;
