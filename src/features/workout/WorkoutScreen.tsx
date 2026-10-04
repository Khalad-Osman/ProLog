import { useEffect, useState } from 'react'
import { listExercises, type Exercise } from '../../api/exercises'
import {
  createWorkout,
  deleteWorkout,
  getWorkout,
  listWorkoutSets,
  updateWorkoutNotes,
  type WorkoutSet,
} from '../../api/workouts'
import { isWorkoutStale } from '../../domain/workout'
import {
  clearStoredWorkout,
  loadStoredWorkout,
  saveStoredWorkout,
} from './activeWorkoutStorage'
import { ExerciseCard } from './ExerciseCard'
import { WorkoutNotes, type NotesStatus } from './WorkoutNotes'

type ActiveWorkout = {
  id: string
  exerciseIds: string[]
  sets: WorkoutSet[]
  /** The notes as last saved to the database ('' when there are none). */
  savedNotes: string
}

type ScreenState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; exercises: Exercise[]; active: ActiveWorkout | null }

/** Loads the user's exercises and, if this device has an unfinished workout, resumes it. */
async function loadScreen(): Promise<{ exercises: Exercise[]; active: ActiveWorkout | null }> {
  const exercises = await listExercises()
  const stored = loadStoredWorkout()
  if (stored === null) {
    return { exercises, active: null }
  }

  const workout = await getWorkout(stored.workoutId)
  if (workout === null || isWorkoutStale(workout.performedAt, new Date())) {
    clearStoredWorkout()
    return { exercises, active: null }
  }

  const sets = await listWorkoutSets(workout.id)
  // Include exercises that have sets even if storage missed them, and drop any deleted since.
  const exerciseIds = [...new Set([...stored.exerciseIds, ...sets.map((set) => set.exerciseId)])]
  const existingIds = exerciseIds.filter((id) => exercises.some((exercise) => exercise.id === id))
  return {
    exercises,
    active: { id: workout.id, exerciseIds: existingIds, sets, savedNotes: workout.notes ?? '' },
  }
}

export function WorkoutScreen() {
  const [state, setState] = useState<ScreenState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPickingExercise, setIsPickingExercise] = useState(false)
  // What's in the notes box right now, which may be ahead of what's saved.
  const [notesDraft, setNotesDraft] = useState('')
  const [notesStatus, setNotesStatus] = useState<NotesStatus>('idle')

  useEffect(() => {
    let isCurrent = true
    loadScreen()
      .then((loaded) => {
        if (isCurrent) {
          setState({ status: 'ready', ...loaded })
          setNotesDraft(loaded.active?.savedNotes ?? '')
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          const message = caught instanceof Error ? caught.message : 'Could not load your workout.'
          setState({ status: 'error', message })
        }
      })
    return () => {
      isCurrent = false
    }
  }, [loadAttempt])

  // Keep this device's stored copy in sync with whatever the active workout is now.
  const activeForStorage = state.status === 'ready' ? state.active : undefined
  useEffect(() => {
    if (activeForStorage === undefined) {
      return // still loading, nothing known yet
    }
    if (activeForStorage === null) {
      clearStoredWorkout()
    } else {
      saveStoredWorkout({ workoutId: activeForStorage.id, exerciseIds: activeForStorage.exerciseIds })
    }
  }, [activeForStorage])

  if (state.status === 'loading') {
    return <p role="status" className="text-slate-400">Loading…</p>
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {state.message}
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ status: 'loading' })
            setLoadAttempt((attempt) => attempt + 1)
          }}
          className="w-full rounded-lg border border-slate-700 py-4 text-lg"
        >
          Try again
        </button>
      </div>
    )
  }

  const { exercises, active } = state

  function setActive(next: ActiveWorkout | null) {
    setState((current) => (current.status === 'ready' ? { ...current, active: next } : current))
  }

  // Updates are computed from the *latest* state, not the state when a save started.
  // Otherwise two sets saved close together could overwrite each other.
  function updateActive(update: (current: ActiveWorkout) => ActiveWorkout) {
    setState((current) =>
      current.status === 'ready' && current.active !== null
        ? { ...current, active: update(current.active) }
        : current,
    )
  }

  async function handleStart() {
    setActionError(null)
    setIsBusy(true)
    try {
      const workout = await createWorkout()
      setActive({ id: workout.id, exerciseIds: [], sets: [], savedNotes: '' })
      setNotesDraft('')
      setNotesStatus('idle')
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not start a workout.')
    } finally {
      setIsBusy(false)
    }
  }

  // Saves on blur rather than every keystroke: one request per edit, and nothing is
  // lost because Finish also saves before closing the workout.
  async function saveNotes(workout: ActiveWorkout): Promise<boolean> {
    const draft = notesDraft.trim()
    if (draft === workout.savedNotes) {
      return true
    }
    setNotesStatus('saving')
    try {
      await updateWorkoutNotes(workout.id, draft)
      updateActive((current) => ({ ...current, savedNotes: draft }))
      setNotesStatus('saved')
      return true
    } catch {
      setNotesStatus('error')
      return false
    }
  }

  async function handleFinish(workout: ActiveWorkout) {
    setActionError(null)
    setIsBusy(true)
    try {
      const notesSaved = await saveNotes(workout)
      if (!notesSaved) {
        setActionError('Your notes could not be saved. Try again before finishing.')
        return
      }
      // A workout with no sets and no notes would only clutter history, so remove it.
      if (workout.sets.length === 0 && notesDraft.trim() === '') {
        await deleteWorkout(workout.id)
      }
      setActive(null)
      setIsPickingExercise(false)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not finish the workout.')
    } finally {
      setIsBusy(false)
    }
  }

  if (active === null) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Workout</h2>
        {exercises.length === 0 ? (
          <p className="text-slate-400">Add your exercises in the Exercises tab, then start a workout.</p>
        ) : (
          <p className="text-slate-400">Ready when you are.</p>
        )}
        {actionError && (
          <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
            {actionError}
          </p>
        )}
        <button
          type="button"
          onClick={handleStart}
          disabled={isBusy || exercises.length === 0}
          className="w-full rounded-lg bg-emerald-500 py-4 text-lg font-semibold text-slate-950 disabled:opacity-60"
        >
          {isBusy ? 'Starting…' : 'Start workout'}
        </button>
      </section>
    )
  }

  const exercisesInWorkout = active.exerciseIds
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise) => exercise !== undefined)
  const exercisesToAdd = exercises.filter((exercise) => !active.exerciseIds.includes(exercise.id))

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Workout</h2>

      {exercisesInWorkout.length === 0 && (
        <p className="text-slate-400">Add your first exercise to see today's recommendation.</p>
      )}

      {exercisesInWorkout.map((exercise) => (
        <ExerciseCard
          key={exercise.id}
          exercise={exercise}
          workoutId={active.id}
          sets={active.sets.filter((set) => set.exerciseId === exercise.id)}
          onSetLogged={(set) => updateActive((current) => ({ ...current, sets: [...current.sets, set] }))}
          onSetDeleted={(setId) =>
            updateActive((current) => ({
              ...current,
              sets: current.sets.filter((set) => set.id !== setId),
            }))
          }
        />
      ))}

      {isPickingExercise ? (
        <div className="space-y-2 rounded-xl border border-slate-700 p-4">
          <p className="text-sm text-slate-300">Choose an exercise</p>
          {exercisesToAdd.length === 0 && (
            <p className="text-slate-400">Every exercise is already in this workout.</p>
          )}
          {exercisesToAdd.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => {
                updateActive((current) => ({
                  ...current,
                  exerciseIds: [...current.exerciseIds, exercise.id],
                }))
                setIsPickingExercise(false)
              }}
              className="w-full rounded-lg bg-slate-800 px-4 py-4 text-left text-lg"
            >
              {exercise.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsPickingExercise(false)}
            className="w-full py-3 text-slate-400 underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsPickingExercise(true)}
          className="w-full rounded-lg border border-slate-700 py-4 text-lg"
        >
          Add exercise
        </button>
      )}

      <WorkoutNotes
        value={notesDraft}
        status={notesStatus}
        onChange={(value) => {
          setNotesDraft(value)
          setNotesStatus('idle')
        }}
        onBlur={() => saveNotes(active)}
      />

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={() => handleFinish(active)}
        disabled={isBusy}
        className="w-full rounded-lg bg-slate-700 py-4 text-lg font-semibold disabled:opacity-60"
      >
        {isBusy ? 'Finishing…' : 'Finish workout'}
      </button>
    </section>
  )
}
