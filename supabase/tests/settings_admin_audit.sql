begin;
select plan(8);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  'RLS is enabled on every public table'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.audit_logs', 'DELETE')
  and not has_table_privilege('service_role', 'public.audit_logs', 'UPDATE')
  and not has_table_privilege('service_role', 'public.audit_logs', 'DELETE'),
  'Audit logs cannot be updated or deleted by application roles'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and policyname = 'audit_admin_read' and cmd = 'SELECT'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and policyname = 'audit_admin_insert' and cmd = 'INSERT'
      and coalesce(with_check, '') ilike '%is_admin%'
  )
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and policyname = 'audit_staff_insert'
  ),
  'Audit log read and append policies are Admin-only'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_update_organization_settings(uuid,uuid,jsonb,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.admin_update_membership(uuid,uuid,uuid,public.app_role,boolean,boolean,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.admin_create_membership(uuid,uuid,uuid,public.app_role,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.admin_create_membership(uuid,uuid,uuid,public.app_role,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_admin_audit_logs(uuid,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,integer)',
    'EXECUTE'
  )
  and not has_table_privilege('authenticated', 'public.memberships', 'INSERT')
  and not has_table_privilege('authenticated', 'public.memberships', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.memberships', 'DELETE'),
  'Privileged administration RPCs are restricted to the server role'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.memberships'::regclass
      and conname = 'memberships_rider_eligibility_role'
  )
  and exists (
    select 1 from pg_trigger
    where tgrelid = 'public.delivery_assignments'::regclass
      and tgname = 'delivery_assignments_eligible_rider'
      and not tgisinternal
  ),
  'Only Riders can be eligible and assignments enforce eligibility'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.memberships'::regclass
      and tgname = 'memberships_admin_safety'
      and not tgisinternal
  ),
  'Membership mutations have self-lockout and last-Admin protection'
);

select ok(
  not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped
      and a.attname ~* '(amount|price|cost|balance|fee|discount|quantity|value)'
      and a.atttypid in ('real'::regtype, 'double precision'::regtype)
  ),
  'Business quantity and money columns avoid floating-point types'
);

select ok(
  not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped
      and a.attname ~ '_at$'
      and a.atttypid = 'timestamp'::regtype
  ),
  'Timestamp columns ending in _at use timezone-aware storage'
);

select * from finish();
rollback;
