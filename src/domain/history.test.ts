import { describe, expect, it } from 'vitest'
import {
  groupByExercise,
  groupIntoSessions,
  removeSetFromGroups,
  replaceSetInGroups,
  type HistorySet,
  type NamedSet,
} from './history'

function namedSet(id: string, exerciseId: string, reps: number): NamedSet {
  return {
    id,
    exerciseId,
    exerciseName: exerciseId === 'bench' ? 'Bench press' : 'Squat',
    exerciseIncrement: exerciseId === 'bench' ? 2.5 : 5,
    reps,
    weight: 100,
    rpe: null,
    isWarmup: false,
  }
}

describe('replaceSetInGroups', () => {
  it('replaces only the matching set and leaves the input unchanged', () => {
    const groups = groupByExercise([namedSet('1', 'bench', 8), namedSet('2', 'bench', 7)])
    const updated = { ...namedSet('2', 'bench', 9), weight: 105 }

    const result = replaceSetInGroups(groups, updated)

    expect(result[0].sets.map((set) => [set.reps, set.weight])).toEqual([
      [8, 100],
      [9, 105],
    ])
    expect(groups[0].sets[1].reps).toBe(7)
  })
})

describe('removeSetFromGroups', () => {
  it('removes the set', () => {
    const groups = groupByExercise([namedSet('1', 'bench', 8), namedSet('2', 'bench', 7)])

    const result = removeSetFromGroups(groups, '1')

    expect(result[0].sets.map((set) => set.id)).toEqual(['2'])
  })

  it('drops an exercise when its last set is removed', () => {
    const groups = groupByExercise([namedSet('1', 'squat', 5), namedSet('2', 'bench', 8)])

    const result = removeSetFromGroups(groups, '1')

    expect(result.map((group) => group.exerciseName)).toEqual(['Bench press'])
  })
})

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
    expect(groups.map((group) => group.increment)).toEqual([5, 2.5])
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
