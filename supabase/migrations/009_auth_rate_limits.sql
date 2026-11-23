create table public.auth_rate_limits (
  rate_key text primary key check (length(rate_key) between 16 and 200),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from public, anon, authenticated;

create or replace function public.consume_auth_rate_limit(
  p_rate_key text,
  p_limit integer default 8,
  p_window_seconds integer default 900
) returns table (allowed boolean, retry_after_seconds integer, attempts integer)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  current_window timestamptz;
  current_attempts integer;
  seconds_left integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_rate_key) < 16 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.auth_rate_limits (rate_key, window_started_at, attempts, updated_at)
  values (p_rate_key, now(), 1, now())
  on conflict (rate_key) do update set
    window_started_at = case
      when public.auth_rate_limits.window_started_at <= now() - (p_window_seconds * interval '1 second') then now()
      else public.auth_rate_limits.window_started_at
    end,
    attempts = case
      when public.auth_rate_limits.window_started_at <= now() - (p_window_seconds * interval '1 second') then 1
      else public.auth_rate_limits.attempts + 1
    end,
    updated_at = now();

  select r.window_started_at, r.attempts into current_window, current_attempts
  from public.auth_rate_limits r where r.rate_key = p_rate_key;
  seconds_left := greatest(1, ceil(extract(epoch from (current_window + (p_window_seconds * interval '1 second') - now())))::integer);
  return query select current_attempts <= p_limit, seconds_left, current_attempts;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_auth_rate_limit(text, integer, integer) to anon, authenticated;
