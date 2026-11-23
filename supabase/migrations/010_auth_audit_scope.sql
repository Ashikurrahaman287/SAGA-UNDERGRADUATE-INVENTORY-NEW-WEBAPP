-- Authentication failures and recovery requests can occur before an organization is known.
-- They remain immutable audit records, but organization_id is intentionally nullable for these global security events.
alter table public.audit_logs alter column organization_id drop not null;

create index audit_auth_events_created on public.audit_logs(entity_type, action, created_at desc) where entity_type = 'authentication';
