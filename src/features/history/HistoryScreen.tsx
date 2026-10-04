import { useEffect, useState } from 'react'
import { listPastWorkouts, type PastWorkout } from '../../api/workouts'
import { formatSet } from '../../domain/workout'

type LoadStatus = 'loading' | 'error' | 'ready'

// e.g. "Sat, Oct 4 · 6:30 PM", in the viewer's own locale and time zone.
function formatWorkoutDate(performedAt: string): string {
  const date = new Date(performedAt)
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

export function HistoryScreen() {
  const [workouts, setWorkouts] = useState<PastWorkout[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [nextPage, setNextPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    listPastWorkouts(0)
      .then((page) => {
        if (isCurrent) {
          setWorkouts(page.workouts)
          setHasMore(page.hasMore)
          setNextPage(1)
          setStatus('ready')
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setLoadError(caught instanceof Error ? caught.message : 'Could not load your history.')
          setStatus('error')
        }
      })
    return () => {
      isCurrent = false
    }
  }, [loadAttempt])

  async function handleLoadMore() {
    setLoadMoreError(null)
    setIsLoadingMore(true)
    try {
      const page = await listPastWorkouts(nextPage)
      setWorkouts((current) => [...current, ...page.workouts])
      setHasMore(page.hasMore)
      setNextPage(nextPage + 1)
    } catch (caught) {
      setLoadMoreError(caught instanceof Error ? caught.message : 'Could not load more workouts.')
    } finally {
      setIsLoadingMore(false)
    }
  }

  if (status === 'loading') {
    return <p role="status" className="text-slate-400">Loading history…</p>
  }

  if (status === 'error') {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus('loading')
            setLoadAttempt((attempt) => attempt + 1)
          }}
          className="w-full rounded-lg border border-slate-700 py-4 text-lg"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">History</h2>

      {workouts.length === 0 && (
        <p className="text-slate-400">No workouts yet. Finished workouts will show up here.</p>
      )}

      {workouts.map((workout) => (
        <PastWorkoutCard key={workout.id} workout={workout} />
      ))}

      {loadMoreError && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {loadMoreError}
        </p>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={isLoadingMore}
          className="w-full rounded-lg border border-slate-700 py-4 text-lg disabled:opacity-60"
        >
          {isLoadingMore ? 'Loading…' : 'Load older workouts'}
        </button>
      )}
    </section>
  )
}

function PastWorkoutCard({ workout }: { workout: PastWorkout }) {
  const title = formatWorkoutDate(workout.performedAt)

  return (
    <article aria-label={title} className="space-y-3 rounded-xl bg-slate-900 p-4">
      <h3 className="font-semibold">{title}</h3>

      {workout.notes && <p className="whitespace-pre-line text-slate-300 italic">{workout.notes}</p>}

      {workout.exercises.length === 0 && <p className="text-sm text-slate-400">No sets logged.</p>}

      {workout.exercises.map((group) => (
        <div key={group.exerciseId}>
          <h4 className="text-sm font-medium text-emerald-300">{group.exerciseName}</h4>
          <ol className="mt-1 space-y-1">
            {group.sets.map((set) => (
              <li key={set.id} className="text-slate-200 tabular-nums">
                {formatSet(set)}
                {set.isWarmup && <span className="ml-2 text-sm text-amber-300">warmup</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </article>
  )
}
