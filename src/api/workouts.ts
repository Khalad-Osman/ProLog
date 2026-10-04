import { groupByExercise, groupIntoSessions, type ExerciseGroup } from '../domain/history'
import type { Session } from '../domain/progression'
import { supabase } from '../lib/supabase'
import type { Tables } from '../types/database'

export type Workout = {
  id: string
  performedAt: string
  notes: string | null
}

export type WorkoutSet = {
  id: string
  exerciseId: string
  setOrder: number
  reps: number
  weight: number
  rpe: number | null
  isWarmup: boolean
}

export type NewWorkoutSet = Omit<WorkoutSet, 'id'> & { workoutId: string }

// Enough to always cover the last two sessions (all the progression rules look at),
// while keeping the request small as history grows.
const HISTORY_SET_LIMIT = 100

function toWorkout(row: Tables<'workouts'>): Workout {
  return { id: row.id, performedAt: row.performed_at, notes: row.notes }
}

function toWorkoutSet(row: Tables<'sets'>): WorkoutSet {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    setOrder: row.set_order,
    reps: row.reps,
    weight: row.weight,
    rpe: row.rpe,
    isWarmup: row.is_warmup,
  }
}

export async function createWorkout(): Promise<Workout> {
  // Every column has a default (user_id = auth.uid(), performed_at = now()).
  const { data, error } = await supabase.from('workouts').insert({}).select().single()
  if (error) {
    throw new Error(error.message)
  }
  return toWorkout(data)
}

/** Returns null when the workout no longer exists (e.g. deleted on another device). */
export async function getWorkout(id: string): Promise<Workout | null> {
  const { data, error } = await supabase.from('workouts').select().eq('id', id).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  return data === null ? null : toWorkout(data)
}

/** Blank notes are stored as null so "no notes" has a single representation. */
export async function updateWorkoutNotes(id: string, notes: string): Promise<void> {
  const trimmed = notes.trim()
  const { error } = await supabase
    .from('workouts')
    .update({ notes: trimmed === '' ? null : trimmed })
    .eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

/** Also deletes the workout's sets (cascade in the database). */
export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function listWorkoutSets(workoutId: string): Promise<WorkoutSet[]> {
  const { data, error } = await supabase
    .from('sets')
    .select()
    .eq('workout_id', workoutId)
    .order('created_at')
  if (error) {
    throw new Error(error.message)
  }
  return data.map(toWorkoutSet)
}

export async function addSet(set: NewWorkoutSet): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('sets')
    .insert({
      workout_id: set.workoutId,
      exercise_id: set.exerciseId,
      set_order: set.setOrder,
      reps: set.reps,
      weight: set.weight,
      rpe: set.rpe,
      is_warmup: set.isWarmup,
    })
    .select()
    .single()
  if (error) {
    throw new Error(error.message)
  }
  return toWorkoutSet(data)
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase.from('sets').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Past sessions for one exercise, newest first, ready for the progression engine.
 * The current workout is excluded so the recommendation doesn't shift mid-session.
 */
export async function getExerciseHistory(
  exerciseId: string,
  currentWorkoutId: string,
): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sets')
    .select('reps, weight, rpe, is_warmup, workout_id, workouts(performed_at)')
    .eq('exercise_id', exerciseId)
    .neq('workout_id', currentWorkoutId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_SET_LIMIT)
  if (error) {
    throw new Error(error.message)
  }

  const historySets = data.map((row) => ({
    workoutId: row.workout_id,
    performedAt: row.workouts.performed_at,
    reps: row.reps,
    weight: row.weight,
    rpe: row.rpe,
    isWarmup: row.is_warmup,
  }))
  return groupIntoSessions(historySets)
}

export type PastWorkout = Workout & {
  exercises: ExerciseGroup[]
}

export const HISTORY_PAGE_SIZE = 20

/**
 * One page of past workouts, newest first, each with its sets grouped by exercise.
 * Workouts, sets and exercise names come back in a single request (PostgREST
 * follows the foreign keys), rather than one request per workout.
 */
export async function listPastWorkouts(
  pageIndex: number,
): Promise<{ workouts: PastWorkout[]; hasMore: boolean }> {
  const from = pageIndex * HISTORY_PAGE_SIZE
  // Ask for one extra row: if it comes back, there's at least one more page.
  const to = from + HISTORY_PAGE_SIZE
  const { data, error } = await supabase
    .from('workouts')
    .select(
      'id, performed_at, notes, sets(id, exercise_id, reps, weight, rpe, is_warmup, created_at, exercises(name))',
    )
    .order('performed_at', { ascending: false })
    .order('created_at', { referencedTable: 'sets' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }

  const workouts = data.slice(0, HISTORY_PAGE_SIZE).map((row) => ({
    id: row.id,
    performedAt: row.performed_at,
    notes: row.notes,
    exercises: groupByExercise(
      row.sets.map((set) => ({
        id: set.id,
        exerciseId: set.exercise_id,
        exerciseName: set.exercises.name,
        reps: set.reps,
        weight: set.weight,
        rpe: set.rpe,
        isWarmup: set.is_warmup,
      })),
    ),
  }))
  return { workouts, hasMore: data.length > HISTORY_PAGE_SIZE }
}
