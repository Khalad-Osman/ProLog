import type { LoggedSet, Session } from './progression'

export type HistorySet = LoggedSet & {
  workoutId: string
  performedAt: string
}

export type NamedSet = LoggedSet & {
  id: string
  exerciseId: string
  exerciseName: string
  /** The exercise's weight step, so editing a past set uses the same stepper jumps. */
  exerciseIncrement: number
}

export type ExerciseGroup = {
  exerciseId: string
  exerciseName: string
  increment: number
  sets: NamedSet[]
}

/**
 * Groups one workout's sets by exercise, for display. Exercises appear in the order
 * they were first trained, and sets keep their original order within each exercise.
 */
export function groupByExercise(sets: NamedSet[]): ExerciseGroup[] {
  const groups = new Map<string, ExerciseGroup>()
  for (const set of sets) {
    const existing = groups.get(set.exerciseId)
    if (existing) {
      existing.sets.push(set)
    } else {
      groups.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        increment: set.exerciseIncrement,
        sets: [set],
      })
    }
  }
  // Map keeps insertion order, which is exactly "order first trained".
  return [...groups.values()]
}

/** Returns new groups with one set's values replaced. The input is not modified. */
export function replaceSetInGroups(groups: ExerciseGroup[], updated: NamedSet): ExerciseGroup[] {
  return groups.map((group) => ({
    ...group,
    sets: group.sets.map((set) => (set.id === updated.id ? updated : set)),
  }))
}

/** Returns new groups without the given set, dropping any exercise left with no sets. */
export function removeSetFromGroups(groups: ExerciseGroup[], setId: string): ExerciseGroup[] {
  return groups
    .map((group) => ({ ...group, sets: group.sets.filter((set) => set.id !== setId) }))
    .filter((group) => group.sets.length > 0)
}

/** Groups a flat list of sets into one session per workout, newest workout first. */
export function groupIntoSessions(sets: HistorySet[]): Session[] {
  const byWorkout = new Map<string, { performedAt: string; sets: LoggedSet[] }>()

  for (const set of sets) {
    const { workoutId, performedAt, ...loggedSet } = set
    const existing = byWorkout.get(workoutId)
    if (existing) {
      existing.sets.push(loggedSet)
    } else {
      byWorkout.set(workoutId, { performedAt, sets: [loggedSet] })
    }
  }

  return [...byWorkout.values()]
    .sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt))
    .map((workout) => ({ sets: workout.sets }))
}
