import type { LoggedSet } from './progression'

export type DatedSession = {
  performedAt: string
  sets: LoggedSet[]
}

export type ProgressPoint = {
  performedAt: string
  /** Heaviest working-set weight that session. */
  topWeight: number
  /** Most reps done at that top weight. */
  repsAtTopWeight: number
  /** Best estimated one-rep max across that session's working sets. */
  estimatedOneRepMax: number
}

/**
 * Epley formula: weight × (1 + reps / 30). A single rep is already a 1RM, so it
 * returns the weight unchanged. Estimates get less reliable above ~10 reps, but
 * the trend is still useful for comparing sessions of the same exercise.
 */
export function estimateOneRepMax(weight: number, reps: number): number {
  const estimate = reps === 1 ? weight : weight * (1 + reps / 30)
  return Math.round(estimate * 10) / 10
}

/** One point per session that had working sets, oldest first (the order a chart reads). */
export function buildProgressPoints(sessions: DatedSession[]): ProgressPoint[] {
  const points: ProgressPoint[] = []
  for (const session of sessions) {
    const workingSets = session.sets.filter((set) => !set.isWarmup)
    if (workingSets.length === 0) {
      continue // warmup-only sessions say nothing about strength
    }
    const topWeight = Math.max(...workingSets.map((set) => set.weight))
    const repsAtTopWeight = Math.max(
      ...workingSets.filter((set) => set.weight === topWeight).map((set) => set.reps),
    )
    const estimatedOneRepMax = Math.max(
      ...workingSets.map((set) => estimateOneRepMax(set.weight, set.reps)),
    )
    points.push({ performedAt: session.performedAt, topWeight, repsAtTopWeight, estimatedOneRepMax })
  }
  return points.sort((a, b) => Date.parse(a.performedAt) - Date.parse(b.performedAt))
}
