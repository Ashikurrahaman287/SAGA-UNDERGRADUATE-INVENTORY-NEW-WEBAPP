do $$
declare
  function_definition text;
  search_statement text := E'  if p_scheduled_at is null then raise exception ''Scheduled delivery time is required''; end if;';
  replacement_statement text := E'  if p_scheduled_at is null then raise exception ''Scheduled delivery time is required''; end if;\n\n  if exists (\n    select 1 from public.audit_logs\n    where organization_id = p_organization_id\n      and entity_type = ''sale''\n      and entity_id = p_sale_id\n      and action = ''delivery_rescheduled''\n      and request_id = p_idempotency_key\n  ) then\n    return true;\n  end if;';
begin
  select pg_get_functiondef(
    'public.reschedule_delivery(uuid,uuid,timestamp with time zone,text,text)'::regprocedure
  ) into function_definition;

  if position(search_statement in function_definition) = 0 then
    raise exception 'Could not locate reschedule validation in reschedule_delivery';
  end if;

  function_definition := replace(function_definition, search_statement, replacement_statement);
  execute function_definition;
end;
$$;
