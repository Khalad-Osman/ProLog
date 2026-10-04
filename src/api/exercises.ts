import type { PostgrestError } from '@supabase/supabase-js'
import type { ExerciseSettings } from '../domain/exercise'
import { supabase } from '../lib/supabase'
import type { Tables, TablesInsert } from '../types/database'

export type Exercise = ExerciseSettings & { id: string }

// The rest of the app uses camelCase; snake_case database names stay inside api/.
function toExercise(row: Tables<'exercises'>): Exercise {
  return {
    id: row.id,
    name: row.name,
    repMin: row.rep_min,
    repMax: row.rep_max,
    increment: row.increment,
  }
}

// user_id is omitted on purpose: the column defaults to auth.uid() in the database.
function toRowFields(settings: ExerciseSettings): Omit<TablesInsert<'exercises'>, 'user_id'> {
  return {
    name: settings.name.trim(),
    rep_min: settings.repMin,
    rep_max: settings.repMax,
    increment: settings.increment,
  }
}

// Postgres code for a unique constraint violation (here: duplicate exercise name).
const UNIQUE_VIOLATION = '23505'

function toFriendlyError(error: PostgrestError, settings?: ExerciseSettings): Error {
  if (error.code === UNIQUE_VIOLATION && settings) {
    return new Error(`You already have an exercise called "${settings.name.trim()}".`)
  }
  return new Error(error.message)
}

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('*').order('name')
  if (error) {
    throw toFriendlyError(error)
  }
  return data.map(toExercise)
}

export async function createExercise(settings: ExerciseSettings): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert(toRowFields(settings))
    .select()
    .single()
  if (error) {
    throw toFriendlyError(error, settings)
  }
  return toExercise(data)
}

export async function updateExercise(id: string, settings: ExerciseSettings): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .update(toRowFields(settings))
    .eq('id', id)
    .select()
    .single()
  if (error) {
    throw toFriendlyError(error, settings)
  }
  return toExercise(data)
}

/** Also deletes every logged set for this exercise (cascade in the database). */
export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id)
  if (error) {
    throw toFriendlyError(error)
  }
}
