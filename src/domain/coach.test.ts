import { describe, expect, it } from 'vitest'
import {
  buildCoachInput,
  isPlateau,
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
      estimatedOneRepMaxChange: -0.8,
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
      { date: '2026-10-29', text: 'Shoulder felt tight' },
      { date: '2026-10-20', text: 'Slept badly' },
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
