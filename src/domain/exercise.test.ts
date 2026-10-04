import { describe, expect, it } from 'vitest'
import { validateExerciseSettings, type ExerciseSettings } from './exercise'

const valid: ExerciseSettings = { name: 'Bench press', repMin: 8, repMax: 12, increment: 2.5 }

describe('validateExerciseSettings', () => {
  it('accepts valid settings', () => {
    expect(validateExerciseSettings(valid)).toBeNull()
  })

  it('accepts a fixed rep target where min equals max', () => {
    expect(validateExerciseSettings({ ...valid, repMin: 5, repMax: 5 })).toBeNull()
  })

  it('rejects a blank or whitespace-only name', () => {
    expect(validateExerciseSettings({ ...valid, name: '   ' })).toMatch(/name/i)
  })

  it('rejects a name that is too long', () => {
    expect(validateExerciseSettings({ ...valid, name: 'x'.repeat(61) })).toMatch(/60 characters/)
  })

  it('rejects minimum reps below 1', () => {
    expect(validateExerciseSettings({ ...valid, repMin: 0 })).toMatch(/minimum/i)
  })

  it('rejects a maximum below the minimum', () => {
    expect(validateExerciseSettings({ ...valid, repMin: 10, repMax: 8 })).toMatch(/maximum/i)
  })

  it('rejects a zero increment', () => {
    expect(validateExerciseSettings({ ...valid, increment: 0 })).toMatch(/increment/i)
  })
})
