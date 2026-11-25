do $$
declare
  function_definition text;
  expression_pattern text := 'payment_status = case[[:space:]]+when confirmed_paid_amount >= total_amount then ''paid''[[:space:]]+when confirmed_paid_amount > 0 then ''partial''[[:space:]]+else ''unpaid''[[:space:]]+end';
  typed_expression text := 'payment_status = case when confirmed_paid_amount >= total_amount then ''paid''::public.payment_status when confirmed_paid_amount > 0 then ''partial''::public.payment_status else ''unpaid''::public.payment_status end';
begin
  select pg_get_functiondef(
    'public.cancel_sale_with_restock(uuid,uuid,text,text)'::regprocedure
  ) into function_definition;

  if regexp_count(function_definition, expression_pattern) <> 1 then
    raise exception 'Could not uniquely locate cancellation payment_status CASE expression';
  end if;

  function_definition := regexp_replace(function_definition, expression_pattern, typed_expression);
  execute function_definition;
end;
$$;
