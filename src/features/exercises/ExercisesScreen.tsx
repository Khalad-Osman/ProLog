import { useEffect, useState } from 'react'
import { listExercises, type Exercise } from '../../api/exercises'
import { ExerciseForm } from './ExerciseForm'

type LoadStatus = 'loading' | 'error' | 'ready'

// null = showing the list, 'new' = creating, Exercise = editing that one.
type Editing = null | 'new' | Exercise

function sortByName(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort((a, b) => a.name.localeCompare(b.name))
}

export function ExercisesScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  // Bumping this re-runs the load effect, which is how "Try again" works.
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    // Ignore a response that arrives after unmount. StrictMode also mounts twice in dev,
    // so without this the first, discarded request could overwrite state.
    let isCurrent = true
    listExercises()
      .then((loaded) => {
        if (isCurrent) {
          setExercises(loaded)
          setStatus('ready')
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setLoadError(caught instanceof Error ? caught.message : 'Could not load exercises.')
          setStatus('error')
        }
      })
    return () => {
      isCurrent = false
    }
  }, [loadAttempt])

  function retry() {
    setStatus('loading')
    setLoadAttempt((attempt) => attempt + 1)
  }

  // Update the list locally after a save instead of refetching everything.
  function handleSaved(saved: Exercise) {
    const others = exercises.filter((exercise) => exercise.id !== saved.id)
    setExercises(sortByName([...others, saved]))
    setEditing(null)
  }

  function handleDeleted(id: string) {
    setExercises(exercises.filter((exercise) => exercise.id !== id))
    setEditing(null)
  }

  if (editing !== null) {
    return (
      <ExerciseForm
        exercise={editing === 'new' ? undefined : editing}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        onCancel={() => setEditing(null)}
      />
    )
  }

  if (status === 'loading') {
    return <p role="status" className="text-slate-400">Loading exercises…</p>
  }

  if (status === 'error') {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {loadError}
        </p>
        <button
          type="button"
          onClick={retry}
          className="w-full rounded-lg border border-slate-700 py-4 text-lg"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Exercises</h2>

      {exercises.length === 0 ? (
        <p className="text-slate-400">No exercises yet. Add the lifts you train to get started.</p>
      ) : (
        <ul className="space-y-2">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => setEditing(exercise)}
                className="flex w-full items-center justify-between rounded-lg bg-slate-900 px-4 py-4 text-left"
              >
                <span className="text-lg font-medium">{exercise.name}</span>
                <span className="text-sm text-slate-400">
                  {exercise.repMin}–{exercise.repMax} reps · +{exercise.increment}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setEditing('new')}
        className="w-full rounded-lg bg-emerald-500 py-4 text-lg font-semibold text-slate-950"
      >
        Add exercise
      </button>
    </section>
  )
}
