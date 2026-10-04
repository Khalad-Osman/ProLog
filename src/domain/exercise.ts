// Validation for exercise settings, kept pure so the rules are unit tested and
// the form can show a clear message before the database would reject the row.

export const MAX_EXERCISE_NAME_LENGTH = 60

export type ExerciseSettings = {
  name: string
  repMin: number
  repMax: number
  increment: number
}

/** Returns a user-facing error message, or null when the settings are valid. */
export function validateExerciseSettings(settings: ExerciseSettings): string | null {
  const name = settings.name.trim()
  if (name.length === 0) {
    return 'Give the exercise a name.'
  }
  if (name.length > MAX_EXERCISE_NAME_LENGTH) {
    return `Keep the name under ${MAX_EXERCISE_NAME_LENGTH} characters.`
  }
  if (!Number.isInteger(settings.repMin) || settings.repMin < 1) {
    return 'Minimum reps must be at least 1.'
  }
  if (!Number.isInteger(settings.repMax) || settings.repMax < settings.repMin) {
    return 'Maximum reps must be at least the minimum.'
  }
  if (settings.increment <= 0) {
    return 'Weight increment must be more than 0.'
  }
  return null
}
