import { describe, expect, it } from 'vitest'
import {
  averageTopSetRpe,
  buildCoachInput,
  COACH_DAILY_LIMIT_PER_USER,
  countReportsLeftToday,
  countSessionsAtCurrentWeight,
  countSessionsSinceBest,
  countWeightIncreases,
  getPeriodStart,
  isPlateau,
  repsShortOfIncrease,
  weeklyChangePercent,
  MAX_COACH_NOTES,
  MAX_NOTE_LENGTH,
  validateCoachRequest,
  type CoachExercise,
  type CoachRequest,
} from './coach'
import { buildProgressPoints, type DatedSession } from './progress'
import type { LoggedSet } from './progression'

const NOW = new Date('2026-11-01T12:00:00Z')

function working(weight: number, reps: number): LoggedSet {
  return { weight, reps, rpe: null, isWarmup: false }
}

function warmup(weight: number, reps: number): LoggedSet {
  return { weight, reps, rpe: null, isWarmup: true }
}

function session(performedAt: string, ...sets: LoggedSet[]): DatedSession {
  return { performedAt, sets }
}

function bench(sessions: DatedSession[]): CoachExercise {
  return { name: 'Bench press', repMin: 8, repMax: 12, increment: 2.5, sessions }
}

function request(overrides: Partial<CoachRequest> = {}): CoachRequest {
  return { topics: ['summary'], weeks: 4, exerciseIds: ['ex-1'], ...overrides }
}

/** Sessions oldest to newest, one estimated-1RM-relevant set each, as progress points. */
function pointsFor(...sets: [weight: number, reps: number][]) {
  return buildProgressPoints(
    sets.map(([weight, reps], index) =>
      session(`2026-10-${String(index + 1).padStart(2, '0')}T18:00:00Z`, working(weight, reps)),
    ),
  )
}

function withRpe(weight: number, reps: number, rpe: number | null): LoggedSet {
  return { weight, reps, rpe, isWarmup: false }
}

/** Two progress points on specific dates, for rate calculations. */
function twoPoints(firstDate: string, latestDate: string) {
  // 60 × 10 → 80, 66 × 10 → 88: a 10% rise in estimated 1RM.
  return buildProgressPoints([
    session(`${firstDate}T18:00:00Z`, working(60, 10)),
    session(`${latestDate}T18:00:00Z`, working(66, 10)),
  ])
}

describe('weeklyChangePercent', () => {
  it('spreads the change over the weeks between first and latest session', () => {
    expect(weeklyChangePercent(twoPoints('2026-10-01', '2026-10-15'))).toBe(5)
  })

  it('treats a span shorter than a week as one week', () => {
    expect(weeklyChangePercent(twoPoints('2026-10-01', '2026-10-04'))).toBe(10)
  })

  it('has no rate with a single session', () => {
    expect(weeklyChangePercent(pointsFor([60, 10]))).toBeNull()
  })
})

describe('countWeightIncreases', () => {
  it('counts each session that went heavier than the one before, not drops', () => {
    expect(countWeightIncreases(pointsFor([60, 8], [62.5, 8], [62.5, 9], [57.5, 8], [65, 8]))).toBe(2)
  })
})

describe('countSessionsAtCurrentWeight', () => {
  it('counts the latest run of sessions at the same top weight', () => {
    expect(countSessionsAtCurrentWeight(pointsFor([62.5, 8], [60, 8], [62.5, 8], [62.5, 9]))).toBe(2)
  })
})

describe('countSessionsSinceBest', () => {
  it('counts sessions after the best estimated 1RM', () => {
    // Estimated 1RMs: 80, 82, 81.3, 80
    expect(countSessionsSinceBest(pointsFor([60, 10], [60, 11], [61, 10], [60, 10]))).toBe(2)
  })

  it('treats matching your best as not falling behind', () => {
    expect(countSessionsSinceBest(pointsFor([60, 11], [60, 10], [60, 11]))).toBe(0)
  })
})

describe('repsShortOfIncrease', () => {
  it('measures the weakest top-weight set against the top of the range', () => {
    const sets = [warmup(40, 10), working(60, 8), working(60, 7), working(50, 12)]

    expect(repsShortOfIncrease(sets, 10)).toBe(3)
  })

  it('is zero once every top set reaches the top of the range', () => {
    expect(repsShortOfIncrease([working(60, 12), working(60, 12)], 12)).toBe(0)
  })
})

describe('averageTopSetRpe', () => {
  it('averages logged RPE on top-weight sets, ignoring sets without one', () => {
    const sessions = [
      session('2026-10-29T18:00:00Z', withRpe(60, 8, 8), withRpe(60, 8, null), withRpe(50, 10, 6)),
      session('2026-10-25T18:00:00Z', withRpe(60, 8, 9)),
    ]

    expect(averageTopSetRpe(sessions)).toBe(8.5)
  })

  it('is null when no RPE was logged', () => {
    expect(averageTopSetRpe([session('2026-10-29T18:00:00Z', working(60, 8))])).toBeNull()
  })
})

describe('validateCoachRequest', () => {
  it('accepts a complete request', () => {
    expect(validateCoachRequest(request())).toBeNull()
  })

  it('requires at least one topic', () => {
    expect(validateCoachRequest(request({ topics: [] }))).toMatch(/topic/)
  })

  it('only allows the offered time ranges', () => {
    expect(validateCoachRequest(request({ weeks: 5 }))).toMatch(/time range/)
  })

  it('requires at least one exercise', () => {
    expect(validateCoachRequest(request({ exerciseIds: [] }))).toMatch(/exercise/)
  })
})

describe('getPeriodStart', () => {
  it('goes back the given number of whole weeks', () => {
    expect(getPeriodStart(4, NOW).toISOString()).toBe('2026-10-04T12:00:00.000Z')
  })
})

describe('countReportsLeftToday', () => {
  it('starts the day with the full allowance', () => {
    expect(countReportsLeftToday([], NOW)).toBe(COACH_DAILY_LIMIT_PER_USER)
  })

  it('only counts attempts since midnight UTC', () => {
    const attempts = ['2026-11-01T00:30:00Z', '2026-10-31T23:59:00Z']

    expect(countReportsLeftToday(attempts, NOW)).toBe(COACH_DAILY_LIMIT_PER_USER - 1)
  })

  it('never goes below zero', () => {
    const attempts = ['2026-11-01T08:00:00Z', '2026-11-01T09:00:00Z', '2026-11-01T10:00:00Z']

    expect(countReportsLeftToday(attempts, NOW)).toBe(0)
  })
})

describe('isPlateau', () => {
  it('needs more sessions than the plateau window to say anything', () => {
    expect(isPlateau(pointsFor([60, 8], [60, 8], [60, 8]))).toBe(false)
  })

  it('flags recent sessions that never beat the earlier best', () => {
    expect(isPlateau(pointsFor([60, 10], [60, 9], [60, 10], [60, 9]))).toBe(true)
  })

  it('does not flag steady progress', () => {
    expect(isPlateau(pointsFor([60, 8], [60, 9], [60, 10], [60, 11]))).toBe(false)
  })

  it('counts one new best in the recent sessions as progress', () => {
    expect(isPlateau(pointsFor([60, 10], [60, 9], [60, 11], [60, 9]))).toBe(false)
  })
})

describe('buildCoachInput', () => {
  it('summarises first and latest sessions in the period', () => {
    const exercise = bench([
      session('2026-10-29T18:00:00Z', working(62.5, 8), working(62.5, 8)),
      session('2026-10-10T18:00:00Z', working(60, 10)),
    ])

    const [facts] = buildCoachInput(request(), [exercise], [], NOW).exercises

    expect(facts).toMatchObject({
      name: 'Bench press',
      sessionsInPeriod: 2,
      first: { date: '2026-10-10', topWeight: 60, repsAtTopWeight: 10, estimatedOneRepMax: 80 },
      latest: { date: '2026-10-29', topWeight: 62.5, repsAtTopWeight: 8, estimatedOneRepMax: 79.2 },
      // (79.2 - 80) / 80 = -1%
      estimatedOneRepMaxChangePercent: -1,
    })
  })

  it('leaves out sessions older than the period', () => {
    const exercise = bench([
      session('2026-10-29T18:00:00Z', working(62.5, 8)),
      session('2026-09-01T18:00:00Z', working(50, 8)),
    ])

    const [facts] = buildCoachInput(request({ weeks: 4 }), [exercise], [], NOW).exercises

    expect(facts.sessionsInPeriod).toBe(1)
    expect(facts.first.topWeight).toBe(62.5)
  })

  it('bases the next-session recommendation on full history, not just the period', () => {
    // Both misses are needed for a deload; the older one is outside a 4-week period.
    const exercise = bench([
      session('2026-10-29T18:00:00Z', working(60, 6)),
      session('2026-09-20T18:00:00Z', working(60, 6)),
    ])

    const [facts] = buildCoachInput(request({ weeks: 4 }), [exercise], [], NOW).exercises

    expect(facts.nextSession.action).toBe('deload')
  })

  it('lists exercises with no working sets in the period separately', () => {
    const exercise = bench([session('2026-10-29T18:00:00Z', warmup(40, 10))])

    const input = buildCoachInput(request(), [exercise], [], NOW)

    expect(input.exercises).toEqual([])
    expect(input.untrainedExercises).toEqual(['Bench press'])
  })

  it('counts only workouts within the period', () => {
    const workouts = [
      { performedAt: '2026-10-29T18:00:00Z', notes: null },
      { performedAt: '2026-10-20T18:00:00Z', notes: null },
      { performedAt: '2026-08-01T18:00:00Z', notes: null },
    ]

    expect(buildCoachInput(request(), [], workouts, NOW).workoutsInPeriod).toBe(2)
  })

  it('describes training consistency over the period', () => {
    const workouts = [
      { performedAt: '2026-10-30T18:00:00Z', notes: null },
      { performedAt: '2026-10-20T18:00:00Z', notes: null },
      { performedAt: '2026-10-17T18:00:00Z', notes: null },
      { performedAt: '2026-10-10T18:00:00Z', notes: null },
    ]

    expect(buildCoachInput(request({ weeks: 4 }), [], workouts, NOW)).toMatchObject({
      workoutsInPeriod: 4,
      workoutsPerWeek: 1.3, // 4 workouts over the 3.1 weeks since the first one
      daysSinceLastWorkout: 1, // Oct 30 18:00 to Nov 1 12:00 is 1.75 days
      longestGapDays: 10,
    })
  })

  it('measures frequency from the first workout, not the start of a longer period', () => {
    // Started two weeks ago, four workouts since: 2 a week, not 4 / 12.
    const workouts = ['2026-10-18', '2026-10-22', '2026-10-25', '2026-10-29'].map((date) => ({
      performedAt: `${date}T12:00:00Z`,
      notes: null,
    }))

    expect(buildCoachInput(request({ weeks: 12 }), [], workouts, NOW).workoutsPerWeek).toBe(2)
  })

  it('has no gap or recency facts without workouts', () => {
    expect(buildCoachInput(request(), [], [], NOW)).toMatchObject({
      daysSinceLastWorkout: null,
      longestGapDays: null,
    })
  })

  it('ranks lifts by weekly progress, leaving out lifts with a single session', () => {
    const slow = { ...bench([
      session('2026-10-29T18:00:00Z', working(61, 10)),
      session('2026-10-15T18:00:00Z', working(60, 10)),
    ]), name: 'Slow' }
    const fast = { ...bench([
      session('2026-10-29T18:00:00Z', working(66, 10)),
      session('2026-10-15T18:00:00Z', working(60, 10)),
    ]), name: 'Fast' }
    const single = { ...bench([session('2026-10-29T18:00:00Z', working(60, 10))]), name: 'Single' }

    const input = buildCoachInput(request(), [slow, single, fast], [], NOW)

    expect(input.exercisesFastestFirst).toEqual(['Fast', 'Slow'])
  })

  it("gives each note that day's change from the previous session, even one before the period", () => {
    const exercise = bench([
      session('2026-10-29T18:00:00Z', working(57, 10)), // 76
      session('2026-09-20T18:00:00Z', working(60, 10)), // 80, outside a 4-week period
    ])
    const workouts = [{ performedAt: '2026-10-29T18:00:00Z', notes: 'Slept badly' }]

    const [note] = buildCoachInput(request({ topics: ['notes'] }), [exercise], workouts, NOW).notes ?? []

    expect(note.sessionChanges).toEqual([{ exercise: 'Bench press', changeFromPreviousSessionPercent: -5 }])
  })

  it('does not include notes unless the notes topic was chosen', () => {
    const workouts = [{ performedAt: '2026-10-29T18:00:00Z', notes: 'Shoulder felt tight' }]

    const input = buildCoachInput(request({ topics: ['summary'] }), [], workouts, NOW)

    expect(input.notes).toBeUndefined()
  })

  it('includes trimmed, non-empty notes newest first when chosen', () => {
    const workouts = [
      { performedAt: '2026-10-20T18:00:00Z', notes: '  Slept badly  ' },
      { performedAt: '2026-10-25T18:00:00Z', notes: '   ' },
      { performedAt: '2026-10-29T18:00:00Z', notes: 'Shoulder felt tight' },
      { performedAt: '2026-10-22T18:00:00Z', notes: null },
    ]

    const input = buildCoachInput(request({ topics: ['notes'] }), [], workouts, NOW)

    expect(input.notes).toEqual([
      { date: '2026-10-29', text: 'Shoulder felt tight', sessionChanges: [] },
      { date: '2026-10-20', text: 'Slept badly', sessionChanges: [] },
    ])
  })

  it('caps how many notes are sent and how long each can be', () => {
    const workouts = Array.from({ length: MAX_COACH_NOTES + 5 }, (_, index) => ({
      performedAt: new Date(NOW.getTime() - (index + 1) * 60 * 60 * 1000).toISOString(),
      notes: 'x'.repeat(MAX_NOTE_LENGTH + 50),
    }))

    const notes = buildCoachInput(request({ topics: ['notes'] }), [], workouts, NOW).notes ?? []

    expect(notes).toHaveLength(MAX_COACH_NOTES)
    expect(notes[0].text).toHaveLength(MAX_NOTE_LENGTH)
  })
})
