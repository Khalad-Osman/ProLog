import type { LoggedSet, Session } from './progression'

export type HistorySet = LoggedSet & {
  workoutId: string
  performedAt: string
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
