begin;
select plan(4);
select has_function('public', 'create_sale_transaction', array['uuid', 'text', 'text', 'uuid', 'uuid', 'text', 'numeric', 'numeric', 'public.payment_method', 'numeric', 'text', 'text', 'jsonb', 'timestamp with time zone', 'text', 'jsonb', 'text'], 'atomic sale transaction RPC exists');
select has_table('public', 'sale_idempotency', 'sale idempotency table exists');
select has_table('public', 'sale_items', 'sale items table exists');
select has_table('public', 'receipts', 'receipt table exists');
select * from finish();
rollback;
