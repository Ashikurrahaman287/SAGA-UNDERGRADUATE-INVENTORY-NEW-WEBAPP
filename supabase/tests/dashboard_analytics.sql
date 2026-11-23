begin;
select plan(3);
select has_function('public', 'get_dashboard_summary', array['uuid', 'timestamp with time zone', 'timestamp with time zone'], 'dashboard summary RPC exists');
select function_privs_are('public', 'get_dashboard_summary', array['uuid', 'timestamp with time zone', 'timestamp with time zone'], 'anon', array[]::text[], 'anonymous callers receive no dashboard RPC privileges');
select function_privs_are('public', 'get_dashboard_summary', array['uuid', 'timestamp with time zone', 'timestamp with time zone'], 'authenticated', array['EXECUTE'], 'authenticated callers can invoke the RLS-protected RPC');
select * from finish();
rollback;
