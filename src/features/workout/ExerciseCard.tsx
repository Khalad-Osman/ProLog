import { useEffect, useState } from 'react'
import type { Exercise } from '../../api/exercises'
import { addSet, deleteSet, getExerciseHistory, type WorkoutSet } from '../../api/workouts'
import { SetForm, type SetValues } from '../../components/SetForm'
import { recommendNextSession, type Recommendation } from '../../domain/progression'
import { formatSet } from '../../domain/workout'

type ExerciseCardProps = {
  exercise: Exercise
  workoutId: string
  /** Sets already logged for this exercise in this workout, in order. */
  sets: WorkoutSet[]
  onSetLogged: (set: WorkoutSet) => void
  onSetDeleted: (setId: string) => void
}

type RecommendationState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; recommendation: Recommendation }

const ACTION_LABELS: Record<Recommendation['action'], string> = {
  increase: 'Add weight',
  maintain: 'Same weight',
  deload: 'Deload',
  none: 'First session',
}

// Mid-exercise, the last set is the best starting point. Otherwise use the recommendation.
function getStartingValues(
  exercise: Exercise,
  recommendation: Recommendation | null,
  sets: WorkoutSet[],
): { weight: number; reps: number } {
  const lastSet = sets.at(-1)
  if (lastSet) {
    return { weight: lastSet.weight, reps: lastSet.reps }
  }
  if (recommendation && recommendation.action !== 'none') {
    return { weight: recommendation.weight, reps: recommendation.targetReps }
  }
  return { weight: 0, reps: exercise.repMin }
}

export function ExerciseCard({ exercise, workoutId, sets, onSetLogged, onSetDeleted }: ExerciseCardProps) {
  const [state, setState] = useState<RecommendationState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    getExerciseHistory(exercise.id, workoutId)
      .then((history) => {
        if (isCurrent) {
          setState({ status: 'ready', recommendation: recommendNextSession(exercise, history) })
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          const message = caught instanceof Error ? caught.message : 'Could not load history.'
          setState({ status: 'error', message })
        }
      })
    return () => {
      isCurrent = false
    }
  }, [exercise, workoutId, loadAttempt])

  function retry() {
    setState({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  async function handleLog(values: SetValues) {
    const saved = await addSet({
      workoutId,
      exerciseId: exercise.id,
      // Gaps after a deleted set are fine: set_order is only used for sorting.
      setOrder: (sets.at(-1)?.setOrder ?? 0) + 1,
      ...values,
    })
    onSetLogged(saved)
  }

  async function handleDelete(set: WorkoutSet) {
    setDeleteError(null)
    setDeletingSetId(set.id)
    try {
      await deleteSet(set.id)
      onSetDeleted(set.id)
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Could not delete the set.')
    } finally {
      setDeletingSetId(null)
    }
  }

  const recommendation = state.status === 'ready' ? state.recommendation : null
  const startingValues = getStartingValues(exercise, recommendation, sets)

  return (
    <section aria-label={exercise.name} className="space-y-4 rounded-xl bg-slate-900 p-4">
      <header>
        <h3 className="text-lg font-semibold">{exercise.name}</h3>
        <p className="text-sm text-slate-400">
          {exercise.repMin}–{exercise.repMax} reps
        </p>
      </header>

      {state.status === 'loading' && (
        <p role="status" className="text-slate-400">
          Checking your history…
        </p>
      )}
      {state.status === 'error' && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-red-950 px-4 py-3">
          <p role="alert" className="text-red-200">
            {state.message}
          </p>
          <button type="button" onClick={retry} className="shrink-0 px-2 py-2 underline">
            Retry
          </button>
        </div>
      )}
      {recommendation && <RecommendationBox recommendation={recommendation} />}

      {sets.length > 0 && (
        <ol className="space-y-2">
          {sets.map((set, index) => (
            <li key={set.id} className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-2">
              <span className="tabular-nums">
                {index + 1}. {formatSet(set)}
                {set.isWarmup && <span className="ml-2 text-sm text-amber-300">warmup</span>}
              </span>
              <button
                type="button"
                aria-label={`Delete set ${index + 1}`}
                onClick={() => handleDelete(set)}
                disabled={deletingSetId !== null}
                className="h-11 w-11 text-slate-400 disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {deleteError && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {deleteError}
        </p>
      )}

      {/* Wait for the recommendation so the steppers start at the suggested values. */}
      {state.status !== 'loading' && (
        <SetForm
          weightStep={exercise.increment}
          initialValues={{ ...startingValues, rpe: null, isWarmup: false }}
          submitLabel="Log set"
          onSubmit={handleLog}
        />
      )}
    </section>
  )
}

function RecommendationBox({ recommendation }: { recommendation: Recommendation }) {
  return (
    <div className="rounded-lg border border-emerald-800 bg-emerald-950/50 px-4 py-3">
      <p className="font-semibold text-emerald-300">
        {ACTION_LABELS[recommendation.action]}
        {recommendation.action !== 'none' &&
          `: ${recommendation.weight} × ${recommendation.targetReps}`}
      </p>
      <p className="mt-1 text-sm text-slate-300">{recommendation.reason}</p>
    </div>
  )
}
