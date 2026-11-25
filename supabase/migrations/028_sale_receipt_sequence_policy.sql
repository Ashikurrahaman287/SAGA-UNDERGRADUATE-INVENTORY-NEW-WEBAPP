drop policy if exists sale_receipt_sequence_rpc_only on public.sale_receipt_sequences;
create policy sale_receipt_sequence_rpc_only on public.sale_receipt_sequences
for all to authenticated
using (
  public.is_staff(organization_id)
  and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true'
)
with check (
  public.is_staff(organization_id)
  and coalesce(current_setting('saga.sale_transaction', true), 'false') = 'true'
);

grant select, insert, update on public.sale_receipt_sequences to authenticated;
