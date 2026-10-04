import { describe, expect, it } from 'vitest'
import {
  calculateDeloadWeight,
  getTopWeightWorkingSets,
  recommendNextSession,
  roundToIncrement,
  type ExerciseConfig,
  type LoggedSet,
  type Session,
} from './progression'

const benchPress: ExerciseConfig = { repMin: 8, repMax: 12, increment: 2.5 }

function workingSet(weight: number, reps: number, rpe: number | null = null): LoggedSet {
  return { weight, reps, rpe, isWarmup: false }
}

function warmupSet(weight: number, reps: number): LoggedSet {
  return { weight, reps, rpe: null, isWarmup: true }
}

function session(...sets: LoggedSet[]): Session {
  return { sets }
}

describe('recommendNextSession', () => {
  describe('increase', () => {
    it('adds the increment and resets to rep_min when every set hits rep_max', () => {
      const history = [session(workingSet(100, 12), workingSet(100, 12), workingSet(100, 12))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'increase', weight: 102.5, targetReps: 8 })
    })

    it('still increases when a set goes beyond rep_max', () => {
      const history = [session(workingSet(100, 14), workingSet(100, 12))]

      expect(recommendNextSession(benchPress, history).action).toBe('increase')
    })

    it('increases when RPE was not logged', () => {
      const history = [session(workingSet(100, 12, null), workingSet(100, 12, null))]

      expect(recommendNextSession(benchPress, history).action).toBe('increase')
    })

    it('increases when RPE is logged but below 9.5', () => {
      const history = [session(workingSet(100, 12, 9), workingSet(100, 12, 8.5))]

      expect(recommendNextSession(benchPress, history).action).toBe('increase')
    })

    it('avoids floating point noise when adding the increment', () => {
      const exercise: ExerciseConfig = { repMin: 8, repMax: 12, increment: 0.1 }
      const history = [session(workingSet(0.2, 12))]

      const result = recommendNextSession(exercise, history)

      expect(result).toMatchObject({ action: 'increase', weight: 0.3 })
    })
  })

  describe('high RPE', () => {
    it('blocks an increase when any set reached RPE 9.5', () => {
      const history = [session(workingSet(100, 12, 8), workingSet(100, 12, 9.5))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'maintain', weight: 100, targetReps: 12 })
      expect(result.reason).toContain('RPE')
    })

    it('blocks an increase at RPE 10', () => {
      const history = [session(workingSet(100, 12, 10))]

      expect(recommendNextSession(benchPress, history).action).toBe('maintain')
    })
  })

  describe('maintain', () => {
    it('keeps the weight and targets one more rep than the weakest set', () => {
      const history = [session(workingSet(100, 11), workingSet(100, 10), workingSet(100, 9))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'maintain', weight: 100, targetReps: 10 })
    })

    it('caps the target at rep_max', () => {
      const history = [session(workingSet(100, 12), workingSet(100, 11))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'maintain', targetReps: 12 })
    })

    it('does not deload after a single miss', () => {
      const history = [session(workingSet(100, 7), workingSet(100, 6)), session(workingSet(100, 9))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'maintain', weight: 100, targetReps: 7 })
    })

    it('does not deload when the previous miss was at a different weight', () => {
      const history = [session(workingSet(100, 7)), session(workingSet(97.5, 7))]

      expect(recommendNextSession(benchPress, history).action).toBe('maintain')
    })

    it('only judges sets at the top weight, ignoring lighter back-off sets', () => {
      const history = [session(workingSet(100, 12), workingSet(100, 12), workingSet(80, 5))]

      expect(recommendNextSession(benchPress, history).action).toBe('increase')
    })
  })

  describe('deload', () => {
    it('drops ~10% after missing rep_min two sessions in a row at the same weight', () => {
      const history = [session(workingSet(100, 7), workingSet(100, 6)), session(workingSet(100, 7))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'deload', weight: 90, targetReps: 8 })
    })

    it('rounds the deload weight to the increment', () => {
      // 62.5 * 0.9 = 56.25, which isn't loadable with 2.5 increments.
      const history = [session(workingSet(62.5, 5)), session(workingSet(62.5, 6))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'deload', weight: 57.5 })
    })
  })

  describe('warmup sets', () => {
    it('ignores low-rep warmups when deciding to increase', () => {
      const history = [
        session(warmupSet(60, 5), warmupSet(80, 3), workingSet(100, 12), workingSet(100, 12)),
      ]

      expect(recommendNextSession(benchPress, history).action).toBe('increase')
    })

    it('does not treat a heavier warmup as the top weight', () => {
      // Unusual, but a heavy single marked as warmup must not become the working weight.
      const history = [session(warmupSet(120, 1), workingSet(100, 10))]

      const result = recommendNextSession(benchPress, history)

      expect(result).toMatchObject({ action: 'maintain', weight: 100, targetReps: 11 })
    })

    it('skips a warmup-only session and uses the last session with working sets', () => {
      const history = [session(warmupSet(60, 10)), session(workingSet(100, 12))]

      expect(recommendNextSession(benchPress, history).action).toBe('increase')
    })
  })

  describe('no history', () => {
    it('returns no recommendation when nothing has been logged', () => {
      const result = recommendNextSession(benchPress, [])

      expect(result.action).toBe('none')
      expect(result.reason).toMatch(/first session/i)
    })

    it('returns no recommendation when only warmups have been logged', () => {
      const result = recommendNextSession(benchPress, [session(warmupSet(60, 10))])

      expect(result.action).toBe('none')
    })

    it('can recommend after a single first session', () => {
      const result = recommendNextSession(benchPress, [session(workingSet(100, 9))])

      expect(result).toMatchObject({ action: 'maintain', weight: 100, targetReps: 10 })
    })
  })

  it('always includes a human-readable reason', () => {
    const histories: Session[][] = [
      [],
      [session(workingSet(100, 12))],
      [session(workingSet(100, 10))],
      [session(workingSet(100, 5)), session(workingSet(100, 5))],
    ]

    for (const history of histories) {
      expect(recommendNextSession(benchPress, history).reason.length).toBeGreaterThan(0)
    }
  })
})

describe('roundToIncrement', () => {
  it('rounds to the nearest multiple of the increment', () => {
    expect(roundToIncrement(56.25, 2.5)).toBe(57.5)
    expect(roundToIncrement(56.2, 2.5)).toBe(55)
    expect(roundToIncrement(91, 5)).toBe(90)
  })

  it('handles fractional plates without floating point noise', () => {
    expect(roundToIncrement(56.3, 1.25)).toBe(56.25)
    expect(roundToIncrement(0.3, 0.1)).toBe(0.3)
  })

  it('never returns a negative weight', () => {
    expect(roundToIncrement(-3, 2.5)).toBe(0)
  })
})

describe('calculateDeloadWeight', () => {
  it('drops about 10%', () => {
    expect(calculateDeloadWeight(100, 2.5)).toBe(90)
  })

  it('always drops at least one increment, even when 10% rounds back up', () => {
    // 10 * 0.9 = 9, which rounds back up to 10 with a 5 increment.
    expect(calculateDeloadWeight(10, 5)).toBe(5)
  })

  it('never goes below zero', () => {
    expect(calculateDeloadWeight(2.5, 5)).toBe(0)
  })
})

describe('getTopWeightWorkingSets', () => {
  it('returns only working sets at the heaviest working weight', () => {
    const sets = [warmupSet(140, 1), workingSet(100, 10), workingSet(100, 9), workingSet(90, 12)]

    expect(getTopWeightWorkingSets(sets)).toEqual([workingSet(100, 10), workingSet(100, 9)])
  })

  it('returns an empty list when there are no working sets', () => {
    expect(getTopWeightWorkingSets([warmupSet(60, 10)])).toEqual([])
  })
})
