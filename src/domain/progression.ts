// Double progression: work up the rep range at a fixed weight, then add weight
// and start again at the bottom of the range. Pure logic, no React or Supabase.

/** Any set with RPE at or above this was too close to failure to justify adding weight. */
export const HIGH_RPE_THRESHOLD = 9.5

/** A deload drops the working weight by roughly 10%. */
export const DELOAD_FACTOR = 0.9

export type ExerciseConfig = {
  repMin: number
  repMax: number
  increment: number
}

export type LoggedSet = {
  reps: number
  weight: number
  rpe: number | null
  isWarmup: boolean
}

export type Session = {
  sets: LoggedSet[]
}

export type Recommendation =
  | {
      action: 'increase' | 'maintain' | 'deload'
      weight: number
      targetReps: number
      reason: string
    }
  | {
      action: 'none'
      reason: string
    }

/**
 * Removes floating point noise (e.g. 0.1 + 0.2 = 0.30000000000000004).
 * Two decimals matches the precision of the weight column in the database.
 */
function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2))
}

/** Rounds a weight to the nearest multiple of the exercise's increment, never below zero. */
export function roundToIncrement(weight: number, increment: number): number {
  const rounded = Math.round(weight / increment) * increment
  return Math.max(0, roundToTwoDecimals(rounded))
}

/** The ~10% lighter weight used after repeated misses, rounded to a loadable value. */
export function calculateDeloadWeight(weight: number, increment: number): number {
  const reduced = roundToIncrement(weight * DELOAD_FACTOR, increment)
  // At light weights 10% can round back up to the same weight; always drop at least one increment.
  const atLeastOneStepLower = Math.min(reduced, weight - increment)
  return roundToIncrement(atLeastOneStepLower, increment)
}

/** Working sets at the heaviest weight used. Warmups and lighter back-off sets don't count. */
export function getTopWeightWorkingSets(sets: LoggedSet[]): LoggedSet[] {
  const workingSets = sets.filter((set) => !set.isWarmup)
  if (workingSets.length === 0) {
    return []
  }
  const topWeight = Math.max(...workingSets.map((set) => set.weight))
  return workingSets.filter((set) => set.weight === topWeight)
}

function missedRepMin(sets: LoggedSet[], repMin: number): boolean {
  return sets.some((set) => set.reps < repMin)
}

function allSetsHitRepMax(sets: LoggedSet[], repMax: number): boolean {
  return sets.every((set) => set.reps >= repMax)
}

// A missing RPE means the user didn't log one, which we treat as "not too hard".
function anySetTooHard(sets: LoggedSet[]): boolean {
  return sets.some((set) => set.rpe !== null && set.rpe >= HIGH_RPE_THRESHOLD)
}

function fewestReps(sets: LoggedSet[]): number {
  return Math.min(...sets.map((set) => set.reps))
}

/**
 * Recommends what to do next session for one exercise.
 *
 * @param history Sessions for this exercise, newest first. Sessions with no
 *                working sets (e.g. warmups only) are skipped.
 */
export function recommendNextSession(
  exercise: ExerciseConfig,
  history: Session[],
): Recommendation {
  const sessionsWithWork = history
    .map((session) => getTopWeightWorkingSets(session.sets))
    .filter((topSets) => topSets.length > 0)

  const [latest, previous] = sessionsWithWork

  if (latest === undefined) {
    return {
      action: 'none',
      reason: 'No working sets logged yet. Log your first session to get a recommendation.',
    }
  }

  const { repMin, repMax, increment } = exercise
  const weight = latest[0].weight

  if (allSetsHitRepMax(latest, repMax) && !anySetTooHard(latest)) {
    return {
      action: 'increase',
      weight: roundToTwoDecimals(weight + increment),
      targetReps: repMin,
      reason: `Every set hit ${repMax} reps at ${weight}. Add ${increment} and aim for ${repMin} reps.`,
    }
  }

  const previousMissedAtSameWeight =
    previous !== undefined && previous[0].weight === weight && missedRepMin(previous, repMin)

  if (missedRepMin(latest, repMin) && previousMissedAtSameWeight) {
    const deloadWeight = calculateDeloadWeight(weight, increment)
    return {
      action: 'deload',
      weight: deloadWeight,
      targetReps: repMin,
      reason: `Missed ${repMin} reps at ${weight} two sessions in a row. Drop to ${deloadWeight} and rebuild from ${repMin} reps.`,
    }
  }

  const targetReps = Math.min(fewestReps(latest) + 1, repMax)
  return {
    action: 'maintain',
    weight,
    targetReps,
    reason: buildMaintainReason(latest, exercise, targetReps),
  }
}

function buildMaintainReason(
  topSets: LoggedSet[],
  exercise: ExerciseConfig,
  targetReps: number,
): string {
  if (allSetsHitRepMax(topSets, exercise.repMax)) {
    return `You hit ${exercise.repMax} reps but at least one set was RPE ${HIGH_RPE_THRESHOLD} or higher. Repeat the weight until it feels easier.`
  }
  if (missedRepMin(topSets, exercise.repMin)) {
    return `A set fell short of ${exercise.repMin} reps. Stay at this weight and aim for ${targetReps} reps on every set.`
  }
  return `Keep the weight and aim for ${targetReps} reps on every set.`
}
