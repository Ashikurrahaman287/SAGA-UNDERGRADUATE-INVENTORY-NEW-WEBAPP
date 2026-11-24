begin;
select plan(12);

select set_config('saga_test.org1', gen_random_uuid()::text, true);
select set_config('saga_test.org2', gen_random_uuid()::text, true);
select set_config('saga_test.admin', gen_random_uuid()::text, true);
select set_config('saga_test.moderator', gen_random_uuid()::text, true);
select set_config('saga_test.rider', gen_random_uuid()::text, true);
select set_config('saga_test.other_admin', gen_random_uuid()::text, true);
select set_config('saga_test.audit_id', gen_random_uuid()::text, true);

insert into public.organizations (id, name, slug)
values
  (current_setting('saga_test.org1')::uuid, 'RLS test one', 'rls-test-one-' || replace(current_setting('saga_test.org1'), '-', '')),
  (current_setting('saga_test.org2')::uuid, 'RLS test two', 'rls-test-two-' || replace(current_setting('saga_test.org2'), '-', ''));

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (current_setting('saga_test.admin')::uuid, 'authenticated', 'authenticated', 'rls-admin-' || current_setting('saga_test.admin') || '@example.invalid', 'test-only'),
  (current_setting('saga_test.moderator')::uuid, 'authenticated', 'authenticated', 'rls-moderator-' || current_setting('saga_test.moderator') || '@example.invalid', 'test-only'),
  (current_setting('saga_test.rider')::uuid, 'authenticated', 'authenticated', 'rls-rider-' || current_setting('saga_test.rider') || '@example.invalid', 'test-only'),
  (current_setting('saga_test.other_admin')::uuid, 'authenticated', 'authenticated', 'rls-other-admin-' || current_setting('saga_test.other_admin') || '@example.invalid', 'test-only');

insert into public.memberships (organization_id, user_id, role, is_active)
values
  (current_setting('saga_test.org1')::uuid, current_setting('saga_test.admin')::uuid, 'admin', true),
  (current_setting('saga_test.org1')::uuid, current_setting('saga_test.moderator')::uuid, 'moderator', true),
  (current_setting('saga_test.org1')::uuid, current_setting('saga_test.rider')::uuid, 'rider', true),
  (current_setting('saga_test.org2')::uuid, current_setting('saga_test.other_admin')::uuid, 'admin', true);

insert into public.business_settings (organization_id, low_stock_threshold)
values
  (current_setting('saga_test.org1')::uuid, 3),
  (current_setting('saga_test.org2')::uuid, 7);

insert into public.audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id)
values (
  current_setting('saga_test.audit_id')::uuid,
  current_setting('saga_test.org1')::uuid,
  current_setting('saga_test.admin')::uuid,
  'rls_fixture',
  'settings',
  current_setting('saga_test.org1')::uuid
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('saga_test.admin'), true);
select is(
  (select count(*)::integer from public.business_settings where organization_id = current_setting('saga_test.org1')::uuid),
  1,
  'Admin can read own organization settings'
);
select is(
  (select count(*)::integer from public.business_settings where organization_id = current_setting('saga_test.org2')::uuid),
  0,
  'Admin cannot read another organization settings'
);
select throws_ok(
  format('update public.audit_logs set action = %L where id = %L::uuid', 'tampered', current_setting('saga_test.audit_id')),
  '42501',
  null,
  'Authenticated Admin cannot update immutable audit events'
);
select throws_ok(
  format('delete from public.audit_logs where id = %L::uuid', current_setting('saga_test.audit_id')),
  '42501',
  null,
  'Authenticated Admin cannot delete immutable audit events'
);
select throws_ok(
  format('update public.memberships set is_active = false where organization_id = %L::uuid and user_id = %L::uuid', current_setting('saga_test.org1'), current_setting('saga_test.moderator')),
  '42501',
  null,
  'Authenticated Admin cannot bypass the membership RPC'
);

select set_config('request.jwt.claim.sub', current_setting('saga_test.moderator'), true);
select is(
  (select count(*)::integer from public.business_settings where organization_id = current_setting('saga_test.org1')::uuid),
  0,
  'Moderator cannot read Admin settings'
);
select is(
  (select count(*)::integer from public.audit_logs where organization_id = current_setting('saga_test.org1')::uuid),
  0,
  'Moderator cannot read audit logs'
);
select throws_ok(
  format('insert into public.audit_logs (organization_id, actor_user_id, action, entity_type) values (%L::uuid, %L::uuid, %L, %L)', current_setting('saga_test.org1'), current_setting('saga_test.moderator'), 'forged', 'settings'),
  '42501',
  null,
  'Moderator cannot append audit events'
);

select set_config('request.jwt.claim.sub', current_setting('saga_test.rider'), true);
select is(
  (select count(*)::integer from public.business_settings where organization_id = current_setting('saga_test.org1')::uuid),
  0,
  'Rider cannot read Admin settings'
);
select is(
  (select count(*)::integer from public.audit_logs where organization_id = current_setting('saga_test.org1')::uuid),
  0,
  'Rider cannot read audit logs'
);
select throws_ok(
  format('insert into public.audit_logs (organization_id, actor_user_id, action, entity_type) values (%L::uuid, %L::uuid, %L, %L)', current_setting('saga_test.org1'), current_setting('saga_test.rider'), 'forged', 'settings'),
  '42501',
  null,
  'Rider cannot append audit events'
);

reset role;
set local role anon;
select is(
  (select count(*)::integer from public.business_settings),
  0,
  'Anonymous callers cannot read organization settings'
);
reset role;
select * from finish();
rollback;
