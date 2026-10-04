// No real session lasts this long, so an older unfinished workout was simply never
// finished. Resuming it would file today's sets under an old date.
export const ACTIVE_WORKOUT_MAX_HOURS = 6

const MS_PER_HOUR = 60 * 60 * 1000

export function isWorkoutStale(performedAt: string, now: Date): boolean {
  const ageInHours = (now.getTime() - Date.parse(performedAt)) / MS_PER_HOUR
  return ageInHours > ACTIVE_WORKOUT_MAX_HOURS
}

/** RPE choices offered when logging a set. Half steps match the database's one decimal. */
export const RPE_CHOICES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]

/** e.g. "100 × 8 @ RPE 8.5", or "100 × 8" when no RPE was logged. */
export function formatSet(set: { weight: number; reps: number; rpe: number | null }): string {
  const rpe = set.rpe === null ? '' : ` @ RPE ${set.rpe}`
  return `${set.weight} × ${set.reps}${rpe}`
}
