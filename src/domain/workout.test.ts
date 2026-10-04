import { describe, expect, it } from 'vitest'
import { formatSet, isWorkoutStale } from './workout'

describe('formatSet', () => {
  it('shows weight, reps and RPE', () => {
    expect(formatSet({ weight: 100, reps: 8, rpe: 8.5 })).toBe('100 × 8 @ RPE 8.5')
  })

  it('leaves out RPE when none was logged', () => {
    expect(formatSet({ weight: 62.5, reps: 10, rpe: null })).toBe('62.5 × 10')
  })
})

describe('isWorkoutStale', () => {
  const now = new Date('2026-10-04T18:00:00Z')

  it('keeps a workout started earlier today active', () => {
    expect(isWorkoutStale('2026-10-04T16:30:00Z', now)).toBe(false)
  })

  it('treats a workout exactly at the limit as still active', () => {
    expect(isWorkoutStale('2026-10-04T12:00:00Z', now)).toBe(false)
  })

  it('treats a workout older than the limit as stale', () => {
    expect(isWorkoutStale('2026-10-04T11:59:00Z', now)).toBe(true)
  })

  it('treats a workout from a previous day as stale', () => {
    expect(isWorkoutStale('2026-09-27T18:00:00Z', now)).toBe(true)
  })
})
