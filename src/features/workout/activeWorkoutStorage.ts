// Remembers the in-progress workout on this device, so a reload or a switch to the
// Exercises tab doesn't lose it. Sets themselves are always saved in the database.

const STORAGE_KEY = 'prolog.activeWorkout'

export type StoredWorkout = {
  workoutId: string
  exerciseIds: string[]
}

function isStoredWorkout(value: unknown): value is StoredWorkout {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.workoutId === 'string' &&
    Array.isArray(candidate.exerciseIds) &&
    candidate.exerciseIds.every((id) => typeof id === 'string')
  )
}

// localStorage can throw (private browsing, storage disabled), and stored data may be
// malformed. Either way, behaving as if nothing is stored is the safe fallback.
export function loadStoredWorkout(): StoredWorkout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    return isStoredWorkout(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveStoredWorkout(workout: StoredWorkout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workout))
  } catch {
    // Not fatal: the workout still works, it just won't survive a reload.
  }
}

export function clearStoredWorkout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
}
