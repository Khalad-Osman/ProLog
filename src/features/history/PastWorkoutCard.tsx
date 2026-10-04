import { useState } from 'react'
import {
  deleteSet,
  deleteWorkout,
  updateSet,
  updateWorkoutNotes,
  type PastWorkout,
} from '../../api/workouts'
import { SetForm, type SetValues } from '../../components/SetForm'
import { removeSetFromGroups, replaceSetInGroups, type NamedSet } from '../../domain/history'
import { formatSet } from '../../domain/workout'
import { MAX_NOTES_LENGTH } from '../workout/WorkoutNotes'

type PastWorkoutCardProps = {
  workout: PastWorkout
  /**
   * Receives an update function rather than a new value, so the list applies it to
   * its latest copy of this workout. Two edits finishing close together can't then
   * overwrite each other.
   */
  onChange: (update: (current: PastWorkout) => PastWorkout) => void
  onDelete: (workoutId: string) => void
}

// e.g. "Sat, Oct 4 · 6:30 PM", in the viewer's own locale and time zone.
function formatWorkoutDate(performedAt: string): string {
  const date = new Date(performedAt)
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback
}

export function PastWorkoutCard({ workout, onChange, onDelete }: PastWorkoutCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = formatWorkoutDate(workout.performedAt)

  function startEditing() {
    setNotesDraft(workout.notes ?? '')
    setError(null)
    setIsEditing(true)
  }

  async function finishEditing() {
    setError(null)
    const trimmed = notesDraft.trim()
    if (trimmed !== (workout.notes ?? '')) {
      setIsBusy(true)
      try {
        await updateWorkoutNotes(workout.id, trimmed)
        onChange((current) => ({ ...current, notes: trimmed === '' ? null : trimmed }))
      } catch (caught) {
        setError(errorMessage(caught, 'Could not save your notes.'))
        return
      } finally {
        setIsBusy(false)
      }
    }
    setEditingSetId(null)
    setIsEditing(false)
  }

  async function handleSaveSet(set: NamedSet, values: SetValues) {
    // SetForm shows its own error if this throws, so no try/catch here.
    await updateSet(set.id, values)
    onChange((current) => ({
      ...current,
      exercises: replaceSetInGroups(current.exercises, { ...set, ...values }),
    }))
    setEditingSetId(null)
  }

  async function handleDeleteSet(set: NamedSet) {
    setError(null)
    setIsBusy(true)
    try {
      await deleteSet(set.id)
      onChange((current) => ({ ...current, exercises: removeSetFromGroups(current.exercises, set.id) }))
    } catch (caught) {
      setError(errorMessage(caught, 'Could not delete the set.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDeleteWorkout() {
    const confirmed = window.confirm(`Delete the workout from ${title}? This can't be undone.`)
    if (!confirmed) {
      return
    }
    setError(null)
    setIsBusy(true)
    try {
      await deleteWorkout(workout.id)
      onDelete(workout.id)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not delete the workout.'))
      setIsBusy(false)
    }
  }

  return (
    <article aria-label={title} className="space-y-3 rounded-xl bg-slate-900 p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {isEditing ? (
          <button
            type="button"
            onClick={finishEditing}
            disabled={isBusy}
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="rounded-lg border border-slate-700 px-4 py-2"
          >
            Edit
          </button>
        )}
      </header>

      {isEditing ? (
        <label className="block">
          <span className="text-sm text-slate-300">Notes</span>
          <textarea
            value={notesDraft}
            maxLength={MAX_NOTES_LENGTH}
            rows={3}
            onChange={(event) => setNotesDraft(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
          />
        </label>
      ) : (
        workout.notes && <p className="whitespace-pre-line text-slate-300 italic">{workout.notes}</p>
      )}

      {workout.exercises.length === 0 && <p className="text-sm text-slate-400">No sets logged.</p>}

      {workout.exercises.map((group) => (
        <div key={group.exerciseId}>
          <h4 className="text-sm font-medium text-emerald-300">{group.exerciseName}</h4>
          <ol className="mt-1 space-y-1">
            {group.sets.map((set, index) => {
              const setLabel = `${group.exerciseName} set ${index + 1}`
              if (editingSetId === set.id) {
                return (
                  <li key={set.id} className="rounded-lg border border-slate-700 p-3">
                    <SetForm
                      weightStep={group.increment}
                      initialValues={set}
                      submitLabel="Save set"
                      onSubmit={(values) => handleSaveSet(set, values)}
                      onCancel={() => setEditingSetId(null)}
                    />
                  </li>
                )
              }
              return (
                <li key={set.id} className="flex items-center justify-between gap-2 text-slate-200">
                  <span className="tabular-nums">
                    {formatSet(set)}
                    {set.isWarmup && <span className="ml-2 text-sm text-amber-300">warmup</span>}
                  </span>
                  {isEditing && (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${setLabel}`}
                        onClick={() => setEditingSetId(set.id)}
                        disabled={isBusy}
                        className="rounded-lg px-3 py-2 text-slate-300 underline disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${setLabel}`}
                        onClick={() => handleDeleteSet(set)}
                        disabled={isBusy}
                        className="h-10 w-10 text-slate-400 disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      {isEditing && (
        <button
          type="button"
          onClick={handleDeleteWorkout}
          disabled={isBusy}
          className="w-full py-3 text-red-300 underline disabled:opacity-60"
        >
          Delete workout
        </button>
      )}
    </article>
  )
}
