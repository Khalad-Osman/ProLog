import { useEffect, useState } from 'react'
import { listExercises, type Exercise } from '../../api/exercises'
import { getExerciseProgress } from '../../api/workouts'
import { buildProgressPoints, type ProgressPoint } from '../../domain/progress'
import { formatShortDate, ProgressChart, SERIES } from './ProgressChart'

type ExercisesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; exercises: Exercise[] }

// Tagged with the exercise it belongs to: if that isn't the selected exercise,
// the selected one is still loading. This avoids a separate "loading" flag that
// would have to be reset every time the selection changes.
type ProgressState =
  | { exerciseId: string; status: 'error'; message: string }
  | { exerciseId: string; status: 'ready'; points: ProgressPoint[] }

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback
}

export function ProgressScreen() {
  const [exercisesState, setExercisesState] = useState<ExercisesState>({ status: 'loading' })
  const [exercisesAttempt, setExercisesAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [progressAttempt, setProgressAttempt] = useState(0)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    let isCurrent = true
    listExercises()
      .then((exercises) => {
        if (isCurrent) {
          setExercisesState({ status: 'ready', exercises })
          setSelectedId((current) => current ?? exercises[0]?.id ?? null)
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setExercisesState({ status: 'error', message: errorMessage(caught, 'Could not load exercises.') })
        }
      })
    return () => {
      isCurrent = false
    }
  }, [exercisesAttempt])

  useEffect(() => {
    if (selectedId === null) {
      return
    }
    let isCurrent = true
    getExerciseProgress(selectedId)
      .then((sessions) => {
        if (isCurrent) {
          setProgress({ exerciseId: selectedId, status: 'ready', points: buildProgressPoints(sessions) })
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          const message = errorMessage(caught, 'Could not load progress.')
          setProgress({ exerciseId: selectedId, status: 'error', message })
        }
      })
    return () => {
      isCurrent = false
    }
  }, [selectedId, progressAttempt])

  if (exercisesState.status === 'loading') {
    return <p role="status" className="text-slate-400">Loading…</p>
  }

  if (exercisesState.status === 'error') {
    return (
      <ErrorWithRetry
        message={exercisesState.message}
        onRetry={() => {
          setExercisesState({ status: 'loading' })
          setExercisesAttempt((attempt) => attempt + 1)
        }}
      />
    )
  }

  const { exercises } = exercisesState
  if (exercises.length === 0 || selectedId === null) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Progress</h2>
        <p className="text-slate-400">Add exercises and log a few workouts to see your progress.</p>
      </section>
    )
  }

  const selected = exercises.find((exercise) => exercise.id === selectedId)
  const current = progress?.exerciseId === selectedId ? progress : null

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Progress</h2>

      <label className="block">
        <span className="text-sm text-slate-300">Exercise</span>
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-lg"
        >
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
      </label>

      {current === null && <p role="status" className="text-slate-400">Loading progress…</p>}

      {current?.status === 'error' && (
        <ErrorWithRetry
          message={current.message}
          onRetry={() => {
            setProgress(null)
            setProgressAttempt((attempt) => attempt + 1)
          }}
        />
      )}

      {current?.status === 'ready' && (
        <ProgressDetails
          exerciseName={selected?.name ?? ''}
          points={current.points}
          showTable={showTable}
          onToggleTable={() => setShowTable(!showTable)}
        />
      )}
    </section>
  )
}

type ProgressDetailsProps = {
  exerciseName: string
  points: ProgressPoint[]
  showTable: boolean
  onToggleTable: () => void
}

function ProgressDetails({ exerciseName, points, showTable, onToggleTable }: ProgressDetailsProps) {
  if (points.length === 0) {
    return <p className="text-slate-400">No working sets logged for {exerciseName} yet.</p>
  }

  const first = points[0]
  const latest = points[points.length - 1]
  const summary =
    points.length === 1
      ? `${exerciseName}: one session so far, top weight ${latest.topWeight}.`
      : `${exerciseName} over ${points.length} sessions: top weight went from ${first.topWeight} to ${latest.topWeight}, estimated 1RM from ${first.estimatedOneRepMax} to ${latest.estimatedOneRepMax}.`

  return (
    <div className="space-y-4">
      {/* Legend with the latest values: names each line and gives the headline numbers. */}
      <dl className="grid grid-cols-2 gap-3">
        <LegendStat label={SERIES.topWeight.label} color={SERIES.topWeight.color} value={latest.topWeight} />
        <LegendStat
          label={SERIES.estimatedOneRepMax.label}
          color={SERIES.estimatedOneRepMax.color}
          value={latest.estimatedOneRepMax}
          dashed
        />
      </dl>

      {points.length === 1 ? (
        <p className="text-slate-400">Log another session to see a trend line.</p>
      ) : (
        <figure role="img" aria-label={summary} className="rounded-xl bg-slate-900 p-2">
          <ProgressChart points={points} />
        </figure>
      )}

      <button
        type="button"
        onClick={onToggleTable}
        aria-expanded={showTable}
        className="w-full rounded-lg border border-slate-700 py-3"
      >
        {showTable ? 'Hide table' : 'Show as table'}
      </button>

      {showTable && <ProgressTable points={points} />}
    </div>
  )
}

type LegendStatProps = {
  label: string
  color: string
  value: number
  dashed?: boolean
}

function LegendStat({ label, color, value, dashed = false }: LegendStatProps) {
  return (
    <div className="rounded-lg bg-slate-900 px-4 py-3">
      <dt className="flex items-center gap-2 text-sm text-slate-400">
        {/* A short line sample in the series' color and dash pattern. */}
        <svg width="20" height="8" aria-hidden="true">
          <line
            x1="0"
            y1="4"
            x2="20"
            y2="4"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={dashed ? '6 4' : undefined}
          />
        </svg>
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{value}</dd>
    </div>
  )
}

function ProgressTable({ points }: { points: ProgressPoint[] }) {
  // Newest first: the most recent sessions are what you usually want to check.
  const rows = [...points].reverse()
  return (
    <table className="w-full text-left tabular-nums">
      <thead className="text-sm text-slate-400">
        <tr>
          <th className="py-2 font-normal">Date</th>
          <th className="py-2 font-normal">Top set</th>
          <th className="py-2 text-right font-normal">Est. 1RM</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((point) => (
          <tr key={point.performedAt} className="border-t border-slate-800">
            <td className="py-2">{formatShortDate(point.performedAt)}</td>
            <td className="py-2">
              {point.topWeight} × {point.repsAtTopWeight}
            </td>
            <td className="py-2 text-right">{point.estimatedOneRepMax}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ErrorWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-4">
      <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="w-full rounded-lg border border-slate-700 py-4 text-lg"
      >
        Try again
      </button>
    </div>
  )
}
