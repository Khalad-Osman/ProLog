import { describe, expect, it } from 'vitest'
import { isWorkoutStale } from './workout'

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
