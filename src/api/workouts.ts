import { groupByExercise, groupIntoSessions, type ExerciseGroup } from '../domain/history'
import type { DatedSession } from '../domain/progress'
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

// Roughly a year of training at ~20 sets per exercise per week. Plenty for a trend
// line, and still one modest request.
const PROGRESS_SET_LIMIT = 1000

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

/** Changes a set's logged values. Which workout and exercise it belongs to never changes. */
export async function updateSet(
  id: string,
  values: { weight: number; reps: number; rpe: number | null; isWarmup: boolean },
): Promise<void> {
  const { error } = await supabase
    .from('sets')
    .update({ weight: values.weight, reps: values.reps, rpe: values.rpe, is_warmup: values.isWarmup })
    .eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase.from('sets').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * An exercise's most recent sets, grouped into sessions, newest first.
 * Shared by recommendations and the progress chart, which only differ in how
 * far back they look and whether the current workout counts.
 */
async function fetchExerciseSessions(
  exerciseId: string,
  setLimit: number,
  excludeWorkoutId?: string,
): Promise<DatedSession[]> {
  let query = supabase
    .from('sets')
    .select('reps, weight, rpe, is_warmup, workout_id, workouts(performed_at)')
    .eq('exercise_id', exerciseId)
  if (excludeWorkoutId !== undefined) {
    query = query.neq('workout_id', excludeWorkoutId)
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(setLimit)
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
  const sessions = groupIntoSessions(historySets)
  // Hitting the limit means the oldest session was probably cut part-way through.
  // A partial session could show a misleading top weight, so leave it out.
  return data.length === setLimit ? sessions.slice(0, -1) : sessions
}

/**
 * Past sessions for one exercise, newest first, ready for the progression engine.
 * The current workout is excluded so the recommendation doesn't shift mid-session.
 */
export async function getExerciseHistory(
  exerciseId: string,
  currentWorkoutId: string,
): Promise<Session[]> {
  return fetchExerciseSessions(exerciseId, HISTORY_SET_LIMIT, currentWorkoutId)
}

/** Dated sessions for one exercise, for the progress chart. */
export async function getExerciseProgress(exerciseId: string): Promise<DatedSession[]> {
  return fetchExerciseSessions(exerciseId, PROGRESS_SET_LIMIT)
}

export type PastWorkout = Workout & {
  exercises: ExerciseGroup[]
}

export const HISTORY_PAGE_SIZE = 20

/**
 * One page of past workouts, newest first, each with its sets grouped by exercise.
 * Workouts, sets and exercise names come back in a single request (PostgREST
 * follows the foreign keys), rather than one request per workout.
 *
 * @param offset How many workouts the caller already has. An offset (rather than a
 *               page number) stays correct after the user deletes a loaded workout.
 */
export async function listPastWorkouts(
  offset: number,
): Promise<{ workouts: PastWorkout[]; hasMore: boolean }> {
  const from = offset
  // Ask for one extra row: if it comes back, there's at least one more page.
  const to = offset + HISTORY_PAGE_SIZE
  const { data, error } = await supabase
    .from('workouts')
    .select(
      'id, performed_at, notes, sets(id, exercise_id, reps, weight, rpe, is_warmup, created_at, exercises(name, increment))',
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
        exerciseIncrement: set.exercises.increment,
        reps: set.reps,
        weight: set.weight,
        rpe: set.rpe,
        isWarmup: set.is_warmup,
      })),
    ),
  }))
  return { workouts, hasMore: data.length > HISTORY_PAGE_SIZE }
}
