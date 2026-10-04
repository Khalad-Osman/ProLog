import { useState, type FormEvent } from 'react'
import { createExercise, deleteExercise, updateExercise, type Exercise } from '../../api/exercises'
import { Stepper } from '../../components/Stepper'
import { MAX_EXERCISE_NAME_LENGTH, validateExerciseSettings } from '../../domain/exercise'

// Common plate jumps. A fixed set of choices is quicker to tap than typing decimals.
const INCREMENT_CHOICES = [1, 1.25, 2.5, 5, 10]

// A rep range above this isn't strength training any more; it also keeps the stepper finite.
const MAX_REPS = 30

const DEFAULT_SETTINGS = { name: '', repMin: 8, repMax: 12, increment: 2.5 }

type ExerciseFormProps = {
  /** The exercise to edit, or undefined to create a new one. */
  exercise?: Exercise
  onSaved: (exercise: Exercise) => void
  onDeleted: (id: string) => void
  onCancel: () => void
}

export function ExerciseForm({ exercise, onSaved, onDeleted, onCancel }: ExerciseFormProps) {
  const initial = exercise ?? DEFAULT_SETTINGS
  const [name, setName] = useState(initial.name)
  const [repMin, setRepMin] = useState(initial.repMin)
  const [repMax, setRepMax] = useState(initial.repMax)
  const [increment, setIncrement] = useState(initial.increment)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = exercise !== undefined
  // Keep an existing exercise's unusual increment (e.g. 0.5) selectable instead of silently changing it.
  const incrementChoices = INCREMENT_CHOICES.includes(initial.increment)
    ? INCREMENT_CHOICES
    : [...INCREMENT_CHOICES, initial.increment].sort((a, b) => a - b)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const settings = { name, repMin, repMax, increment }
    const validationError = validateExerciseSettings(settings)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsBusy(true)
    try {
      const saved = isEditing
        ? await updateExercise(exercise.id, settings)
        : await createExercise(settings)
      onSaved(saved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Please try again.')
      setIsBusy(false)
    }
  }

  async function handleDelete() {
    if (!isEditing) {
      return
    }
    const confirmed = window.confirm(
      `Delete "${exercise.name}"? This also deletes every set you've logged for it.`,
    )
    if (!confirmed) {
      return
    }

    setError(null)
    setIsBusy(true)
    try {
      await deleteExercise(exercise.id)
      onDeleted(exercise.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete. Please try again.')
      setIsBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-xl font-semibold">{isEditing ? 'Edit exercise' : 'New exercise'}</h2>

      <label className="block">
        <span className="text-sm text-slate-300">Name</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_EXERCISE_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Bench press"
          className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-lg"
        />
      </label>

      {/* Each bound limits the other so the range can never be invalid. */}
      <Stepper label="Min reps" value={repMin} onChange={setRepMin} min={1} max={repMax} />
      <Stepper label="Max reps" value={repMax} onChange={setRepMax} min={repMin} max={MAX_REPS} />

      <fieldset>
        <legend className="text-sm text-slate-300">Weight increment</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {incrementChoices.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={increment === choice}
              onClick={() => setIncrement(choice)}
              className="min-w-14 rounded-lg border border-slate-700 px-4 py-3 text-lg aria-pressed:border-emerald-400 aria-pressed:bg-emerald-950"
            >
              {choice}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          className="flex-1 rounded-lg border border-slate-700 py-4 text-lg disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isBusy}
          className="flex-1 rounded-lg bg-emerald-500 py-4 text-lg font-semibold text-slate-950 disabled:opacity-60"
        >
          {isBusy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {isEditing && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isBusy}
          className="w-full py-3 text-red-300 underline disabled:opacity-60"
        >
          Delete exercise
        </button>
      )}
    </form>
  )
}
