-- More realistic demo data, in pounds: an intermediate lifter's numbers over about
-- six weeks. Replaces the seed function from 20261005000218; the trigger that
-- calls it is unchanged. Existing demo accounts keep their data; new ones get this.
--
-- Over 14 sessions, double progression produces:
--   Bench press  6–8 reps,  +5:  185 → 205
--   Squat        5–7 reps, +10:  205 → 245 (last session hits 7s, so it recommends 255)
--   Barbell row  8–10 reps, +10: 105 → 155
-- Each lift starts at a different point in its rep range (starting_reps), which
-- spreads out the weight jumps and gives the demo a mix of recommendations.

create or replace function public.seed_demo_data()
returns trigger
language plpgsql
-- Runs as the function owner: the trigger fires inside Supabase Auth's insert,
-- where there is no signed-in user for RLS to check against. It only ever writes
-- rows owned by the newly created user (new.id).
security definer
-- An empty search_path stops a security definer function from being tricked into
-- using look-alike objects; every name below is schema-qualified.
set search_path = ''
as $$
declare
  exercise_names  text[]    := array['Bench press', 'Squat', 'Barbell row'];
  rep_mins        integer[] := array[6, 5, 8];
  rep_maxes       integer[] := array[8, 7, 10];
  increments      numeric[] := array[5, 10, 10];
  weights         numeric[] := array[185, 205, 105];
  starting_reps   integer[] := array[6, 6, 10];

  session_count   constant integer := 14;
  days_between    constant integer := 3;

  exercise_ids    uuid[] := array[]::uuid[];
  target_reps     integer[];
  new_exercise_id uuid;
  new_workout_id  uuid;
  performed       timestamptz;
  set_number      integer;
  first_set_reps  integer;
  session_number  integer;
  i               integer;
begin
  for i in 1..array_length(exercise_names, 1) loop
    insert into public.exercises (user_id, name, rep_min, rep_max, increment)
    values (new.id, exercise_names[i], rep_mins[i], rep_maxes[i], increments[i])
    returning id into new_exercise_id;
    exercise_ids := exercise_ids || new_exercise_id;
  end loop;

  target_reps := starting_reps;

  -- Oldest session first, the last one two days ago, every third evening.
  for session_number in 1..session_count loop
    performed := date_trunc('day', now())
      - make_interval(days => (session_count - session_number) * days_between + 2)
      + interval '18 hours';

    insert into public.workouts (user_id, performed_at, notes, created_at)
    values (
      new.id,
      performed,
      case session_number
        when 1 then 'First week back. Keeping it light.'
        when 8 then 'Slept badly, bench felt heavy.'
        else null
      end,
      performed
    )
    returning id into new_workout_id;

    for i in 1..array_length(exercise_ids, 1) loop
      set_number := 1;

      -- One warmup at about half the working weight.
      insert into public.sets
        (user_id, workout_id, exercise_id, set_order, reps, weight, rpe, is_warmup, created_at)
      values (
        new.id, new_workout_id, exercise_ids[i], set_number, 8,
        round(weights[i] * 0.5 / increments[i]) * increments[i],
        null, true,
        -- Explicit timestamps keep sets in a realistic order (one transaction
        -- would otherwise give them all the same created_at).
        performed + make_interval(mins => i * 15 + set_number * 2)
      );

      -- Three working sets following double progression: the first set gets one
      -- more rep than the rest, so the weakest set improves by a rep each session
      -- until every set reaches the top of the range.
      first_set_reps := least(target_reps[i] + 1, rep_maxes[i]);
      for set_number in 2..4 loop
        insert into public.sets
          (user_id, workout_id, exercise_id, set_order, reps, weight, rpe, is_warmup, created_at)
        values (
          new.id, new_workout_id, exercise_ids[i], set_number,
          case when set_number = 2 then first_set_reps else target_reps[i] end,
          weights[i],
          -- RPE on the last set only, like a lifter who logs it occasionally.
          case when set_number = 4 then (case when target_reps[i] = rep_maxes[i] then 9 else 8 end) end,
          false,
          performed + make_interval(mins => i * 15 + set_number * 2)
        );
      end loop;

      -- Hitting the top of the range on every set earns more weight next time.
      if target_reps[i] >= rep_maxes[i] then
        weights[i] := weights[i] + increments[i];
        target_reps[i] := rep_mins[i];
      else
        target_reps[i] := target_reps[i] + 1;
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

-- "create or replace" keeps the existing permissions, but restate the intent:
-- the browser must never be able to call this function.
revoke execute on function public.seed_demo_data() from public, anon, authenticated;
