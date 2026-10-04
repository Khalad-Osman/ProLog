import { useEffect, useState } from 'react'
import { listPastWorkouts, type PastWorkout } from '../../api/workouts'
import { PastWorkoutCard } from './PastWorkoutCard'

type LoadStatus = 'loading' | 'error' | 'ready'

export function HistoryScreen() {
  const [workouts, setWorkouts] = useState<PastWorkout[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
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

  function updateWorkout(id: string, update: (current: PastWorkout) => PastWorkout) {
    setWorkouts((current) => current.map((workout) => (workout.id === id ? update(workout) : workout)))
  }

  function removeWorkout(id: string) {
    setWorkouts((current) => current.filter((workout) => workout.id !== id))
  }

  async function handleLoadMore() {
    setLoadMoreError(null)
    setIsLoadingMore(true)
    try {
      const page = await listPastWorkouts(workouts.length)
      setWorkouts((current) => [...current, ...page.workouts])
      setHasMore(page.hasMore)
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
        <PastWorkoutCard
          key={workout.id}
          workout={workout}
          onChange={(update) => updateWorkout(workout.id, update)}
          onDelete={removeWorkout}
        />
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
