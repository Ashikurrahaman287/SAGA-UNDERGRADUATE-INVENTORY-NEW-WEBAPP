do $$
declare
  function_definition text;
  old_statement text := E'  insert into public.sale_cancellations (';
  new_statement text := E'  perform set_config(''saga.sale_transaction'', ''true'', true);\n  insert into public.sale_cancellations (';
begin
  select pg_get_functiondef(
    'public.cancel_sale_with_restock(uuid,uuid,text,text)'::regprocedure
  ) into function_definition;

  if position(old_statement in function_definition) = 0 then
    raise exception 'Could not locate cancellation record insert in cancel_sale_with_restock';
  end if;

  function_definition := replace(function_definition, old_statement, new_statement);
  execute function_definition;
end;
$$;
