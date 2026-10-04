-- Core schema: exercises, workouts and the sets logged within them.
--
-- Every table carries user_id and has RLS enabled, so the anon key in the
-- browser can only ever reach the signed-in user's own rows.
--
-- user_id defaults to auth.uid() so the client never has to send it, and the
-- insert policies still reject any attempt to set it to someone else.
--
-- Weights use numeric rather than float so values like 2.5 or 1.25 kg are
-- stored exactly and never drift to 2.4999999.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.exercises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  rep_min    integer not null check (rep_min > 0),
  rep_max    integer not null,
  increment  numeric(5, 2) not null check (increment > 0),
  created_at timestamptz not null default now(),

  constraint exercises_rep_range_valid check (rep_min <= rep_max),
  -- Two exercises with the same name would make history ambiguous for the user.
  constraint exercises_name_unique_per_user unique (user_id, name)
);

create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  performed_at timestamptz not null default now(),
  notes        text,
  created_at   timestamptz not null default now()
);

create table public.sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id  uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  set_order   integer not null check (set_order > 0),
  reps        integer not null check (reps > 0),
  weight      numeric(6, 2) not null check (weight >= 0),
  -- Nullable because logging RPE is optional; one decimal allows half steps like 8.5.
  rpe         numeric(3, 1) check (rpe between 6 and 10),
  is_warmup   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- The progression engine asks "all sets of exercise X, grouped by workout".
create index sets_exercise_id_workout_id_idx on public.sets (exercise_id, workout_id);

-- Postgres doesn't index foreign keys automatically; this keeps the cascade
-- delete from workouts and "sets in this workout" lookups fast.
create index sets_workout_id_idx on public.sets (workout_id);

-- History screens list a user's workouts newest first.
create index workouts_user_id_performed_at_idx on public.workouts (user_id, performed_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Policies target the "authenticated" role only, so signed-out visitors get
-- nothing. auth.uid() is wrapped in a select so Postgres evaluates it once per
-- query instead of once per row (recommended by Supabase for performance).

alter table public.exercises enable row level security;
alter table public.workouts  enable row level security;
alter table public.sets      enable row level security;

-- exercises ----------------------------------------------------------------

-- Users can only read their own exercises.
create policy "exercises: select own" on public.exercises
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Users can only create exercises owned by themselves.
create policy "exercises: insert own" on public.exercises
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Users can only edit their own exercises, and can't hand them to another user.
create policy "exercises: update own" on public.exercises
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Users can only delete their own exercises.
create policy "exercises: delete own" on public.exercises
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- workouts -----------------------------------------------------------------

-- Users can only read their own workouts.
create policy "workouts: select own" on public.workouts
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Users can only create workouts owned by themselves.
create policy "workouts: insert own" on public.workouts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Users can only edit their own workouts, and can't hand them to another user.
create policy "workouts: update own" on public.workouts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Users can only delete their own workouts.
create policy "workouts: delete own" on public.workouts
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- sets ---------------------------------------------------------------------

-- Users can only read their own sets.
create policy "sets: select own" on public.sets
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Users can only create sets owned by themselves.
create policy "sets: insert own" on public.sets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Users can only edit their own sets, and can't hand them to another user.
create policy "sets: update own" on public.sets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Users can only delete their own sets.
create policy "sets: delete own" on public.sets
  for delete to authenticated
  using ((select auth.uid()) = user_id);
