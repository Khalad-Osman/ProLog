import { describe, expect, it } from 'vitest'
import { groupByExercise, groupIntoSessions, type HistorySet, type NamedSet } from './history'

function namedSet(id: string, exerciseId: string, reps: number): NamedSet {
  return {
    id,
    exerciseId,
    exerciseName: exerciseId === 'bench' ? 'Bench press' : 'Squat',
    reps,
    weight: 100,
    rpe: null,
    isWarmup: false,
  }
}

describe('groupByExercise', () => {
  it('returns no groups for no sets', () => {
    expect(groupByExercise([])).toEqual([])
  })

  it('groups sets by exercise in the order exercises were first trained', () => {
    const sets = [
      namedSet('1', 'squat', 5),
      namedSet('2', 'bench', 8),
      namedSet('3', 'squat', 4),
      namedSet('4', 'bench', 7),
    ]

    const groups = groupByExercise(sets)

    expect(groups.map((group) => group.exerciseName)).toEqual(['Squat', 'Bench press'])
    expect(groups[0].sets.map((set) => set.id)).toEqual(['1', '3'])
    expect(groups[1].sets.map((set) => set.id)).toEqual(['2', '4'])
  })
})

function historySet(workoutId: string, performedAt: string, reps: number): HistorySet {
  return { workoutId, performedAt, reps, weight: 100, rpe: null, isWarmup: false }
}

describe('groupIntoSessions', () => {
  it('returns no sessions for no sets', () => {
    expect(groupIntoSessions([])).toEqual([])
  })

  it('groups sets by workout, newest workout first', () => {
    const sets = [
      historySet('old', '2026-09-01T10:00:00+00:00', 8),
      historySet('new', '2026-09-08T10:00:00+00:00', 10),
      historySet('old', '2026-09-01T10:00:00+00:00', 7),
      historySet('new', '2026-09-08T10:00:00+00:00', 9),
    ]

    const sessions = groupIntoSessions(sets)

    expect(sessions).toHaveLength(2)
    expect(sessions[0].sets.map((set) => set.reps)).toEqual([10, 9])
    expect(sessions[1].sets.map((set) => set.reps)).toEqual([8, 7])
  })

  it('sorts by time, not by the order sets arrive in', () => {
    const sets = [
      historySet('a', '2026-09-01T10:00:00+00:00', 5),
      historySet('b', '2026-09-15T10:00:00+00:00', 6),
      historySet('c', '2026-09-08T10:00:00+00:00', 7),
    ]

    const reps = groupIntoSessions(sets).map((session) => session.sets[0].reps)

    expect(reps).toEqual([6, 7, 5])
  })

  it('strips workout details so sessions match the progression engine input', () => {
    const [session] = groupIntoSessions([historySet('a', '2026-09-01T10:00:00+00:00', 8)])

    expect(session.sets[0]).toEqual({ reps: 8, weight: 100, rpe: null, isWarmup: false })
  })
})
