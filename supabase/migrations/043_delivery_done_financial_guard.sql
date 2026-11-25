do $$
declare
  function_definition text;
  old_statement text := E'  if received > 0 then';
  new_statement text := E'  perform set_config(''saga.sale_transaction'', ''true'', true);\n  if received > 0 then';
begin
  select pg_get_functiondef(
    'public.complete_sale_delivery(uuid,uuid,numeric,public.payment_method,text,text,text)'::regprocedure
  ) into function_definition;

  if position(old_statement in function_definition) = 0 then
    raise exception 'Could not locate payment insert in complete_sale_delivery';
  end if;

  function_definition := replace(function_definition, old_statement, new_statement);
  execute function_definition;
end;
$$;
