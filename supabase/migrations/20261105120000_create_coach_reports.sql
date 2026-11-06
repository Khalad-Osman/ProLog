-- Progress Coach reports, and the daily caps that bound AI spending.
--
-- Each request to the coach creates one row. The row is both the saved report
-- (so it can be reread without paying again) and the usage record the caps count.
--
-- Who can do what:
--   * Users can only READ their own reports (RLS, same "own rows only" rule as
--     every other table).
--   * Only the Edge Function WRITES, using the service-role key, which stays on
--     the server. There are deliberately no insert, update or delete policies:
--     if users could insert they could skip the caps, and if they could delete
--     they could free up a slot and get extra reports.

create table public.coach_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  topics       text[] not null,
  period_weeks integer not null check (period_weeks in (4, 8, 12)),
  -- pending: reserved, AI call in progress. complete: sections saved. failed: the
  -- call errored. Failed attempts still count toward the caps, because a call that
  -- fails after the model has replied (e.g. unreadable output) has still cost money.
  status       text not null default 'pending' check (status in ('pending', 'complete', 'failed')),
  -- The report itself: a JSON array of { "title": ..., "body": ... } sections.
  sections     jsonb,
  created_at   timestamptz not null default now(),

  constraint coach_reports_topics_valid check (
    cardinality(topics) > 0
    and topics <@ array['summary', 'trends', 'plateaus', 'notes']
  ),
  -- A finished report always has content, and an unfinished one never does.
  constraint coach_reports_sections_match_status check (
    (status = 'complete') = (sections is not null)
  )
);

-- The Progress tab lists a user's reports newest first, and the per-user cap
-- counts that user's reports since midnight.
create index coach_reports_user_id_created_at_idx on public.coach_reports (user_id, created_at desc);

-- The global cap counts every report since midnight.
create index coach_reports_created_at_idx on public.coach_reports (created_at);

alter table public.coach_reports enable row level security;

-- Users can only read their own reports.
create policy "coach_reports: select own" on public.coach_reports
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Reserving a report (enforces the caps)
-- ---------------------------------------------------------------------------
-- The Edge Function calls this BEFORE contacting OpenAI. It either inserts a
-- pending row and returns its id, or raises an error if a cap is reached.
--
-- Why in the database rather than the Edge Function: checking "how many today?"
-- and then inserting are two steps. Two requests arriving together could both
-- see "1 of 2 used" and both insert. The advisory lock makes requests take turns
-- (it is released automatically when the transaction ends), so the count is
-- always accurate when the insert happens.
--
-- Days are counted in UTC, so the caps reset at midnight UTC.

create function public.reserve_coach_report(
  p_user_id uuid,
  p_topics text[],
  p_period_weeks integer
)
returns uuid
language plpgsql
security definer
-- An empty search_path stops a security definer function from being tricked into
-- using look-alike objects; every name below is schema-qualified.
set search_path = ''
as $$
declare
  per_user_daily_limit constant integer := 2;
  global_daily_limit   constant integer := 8;
  today_start          timestamptz := date_trunc('day', now());
  global_count         integer;
  user_count           integer;
  new_report_id        uuid;
begin
  -- Any fixed number works as the lock key; hashtext turns a readable name into one.
  perform pg_advisory_xact_lock(hashtext('coach_reports_daily_cap'));

  select count(*) into global_count
  from public.coach_reports
  where created_at >= today_start;

  if global_count >= global_daily_limit then
    raise exception 'coach_global_limit_reached';
  end if;

  select count(*) into user_count
  from public.coach_reports
  where user_id = p_user_id and created_at >= today_start;

  if user_count >= per_user_daily_limit then
    raise exception 'coach_user_limit_reached';
  end if;

  insert into public.coach_reports (user_id, topics, period_weeks)
  values (p_user_id, p_topics, p_period_weeks)
  returning id into new_report_id;

  return new_report_id;
end;
$$;

-- It takes a user id as a parameter, so it must never be callable from the
-- browser: anyone could spend another user's allowance. Only the Edge Function
-- (service role) may call it.
revoke execute on function public.reserve_coach_report(uuid, text[], integer)
  from public, anon, authenticated;
grant execute on function public.reserve_coach_report(uuid, text[], integer)
  to service_role;
