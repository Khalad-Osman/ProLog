import { describe, expect, it } from 'vitest'
import type { LoggedSet } from './progression'
import { buildProgressPoints, estimateOneRepMax, type DatedSession } from './progress'

function working(weight: number, reps: number): LoggedSet {
  return { weight, reps, rpe: null, isWarmup: false }
}

function warmup(weight: number, reps: number): LoggedSet {
  return { weight, reps, rpe: null, isWarmup: true }
}

function session(performedAt: string, ...sets: LoggedSet[]): DatedSession {
  return { performedAt, sets }
}

describe('estimateOneRepMax', () => {
  it('applies the Epley formula', () => {
    // 100 × (1 + 10/30) = 133.33…
    expect(estimateOneRepMax(100, 10)).toBe(133.3)
  })

  it('returns the weight itself for a single rep', () => {
    expect(estimateOneRepMax(140, 1)).toBe(140)
  })

  it('rounds to one decimal', () => {
    // 62.5 × (1 + 8/30) = 79.1666…
    expect(estimateOneRepMax(62.5, 8)).toBe(79.2)
  })
})

describe('buildProgressPoints', () => {
  it('returns no points without sessions', () => {
    expect(buildProgressPoints([])).toEqual([])
  })

  it('takes the top working weight and the best reps at that weight', () => {
    const [point] = buildProgressPoints([
      session('2026-10-01T18:00:00Z', working(100, 6), working(100, 8), working(90, 12)),
    ])

    expect(point).toMatchObject({ topWeight: 100, repsAtTopWeight: 8 })
  })

  it('uses the best estimate from any working set, not just the heaviest', () => {
    // 100 × 3 → 110, but 90 × 10 → 120: the lighter set is the stronger performance.
    const [point] = buildProgressPoints([
      session('2026-10-01T18:00:00Z', working(100, 3), working(90, 10)),
    ])

    expect(point.estimatedOneRepMax).toBe(120)
  })

  it('ignores warmups, including a heavy one', () => {
    const [point] = buildProgressPoints([
      session('2026-10-01T18:00:00Z', warmup(140, 1), working(100, 8)),
    ])

    expect(point.topWeight).toBe(100)
  })

  it('skips sessions with only warmups', () => {
    const points = buildProgressPoints([
      session('2026-10-01T18:00:00Z', warmup(60, 10)),
      session('2026-10-04T18:00:00Z', working(100, 8)),
    ])

    expect(points).toHaveLength(1)
  })

  it('orders points oldest first, whatever order sessions arrive in', () => {
    const points = buildProgressPoints([
      session('2026-10-08T18:00:00Z', working(105, 8)),
      session('2026-10-01T18:00:00Z', working(100, 8)),
    ])

    expect(points.map((point) => point.topWeight)).toEqual([100, 105])
  })
})
