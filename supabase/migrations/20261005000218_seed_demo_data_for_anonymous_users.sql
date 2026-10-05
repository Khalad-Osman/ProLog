-- Demo accounts: "Try the demo" signs a visitor in anonymously, and this trigger
-- gives that new anonymous user a few weeks of sample training so recommendations,
-- history and charts have something to show straight away.
--
-- Why a database trigger rather than inserting from the browser: the trigger runs
-- in the same transaction that creates the user, so the data already exists by the
-- time the browser has a session. Seeding from the client would race the screens,
-- which start loading as soon as the user is signed in.
--
-- Each demo visitor gets their own rows (user_id = their anonymous id), so the
-- normal "own rows only" RLS policies isolate demo users from each other.

create function public.seed_demo_data()
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
  -- Three lifts, each with its own rep range, increment and starting weight.
  exercise_names  text[]    := array['Bench press', 'Squat', 'Barbell row'];
  rep_mins        integer[] := array[8, 5, 8];
  rep_maxes       integer[] := array[12, 8, 12];
  increments      numeric[] := array[2.5, 5, 2.5];
  weights         numeric[] := array[60, 80, 50];

  session_count   constant integer := 12;
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

  target_reps := rep_mins;

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
        when 7 then 'Slept badly, bench felt heavy.'
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

-- The trigger function must never be callable from the browser. (Trigger functions
-- can't be called through the API anyway; this makes the intent explicit.)
revoke execute on function public.seed_demo_data() from public, anon, authenticated;

-- Only anonymous (demo) users get sample data; real sign-ups start empty.
create trigger seed_demo_data_on_anonymous_sign_up
  after insert on auth.users
  for each row
  when (new.is_anonymous)
  execute function public.seed_demo_data();
