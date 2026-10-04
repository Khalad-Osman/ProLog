import { useState } from 'react'
import { RPE_CHOICES } from '../domain/workout'
import { Stepper } from './Stepper'

export type SetValues = {
  weight: number
  reps: number
  rpe: number | null
  isWarmup: boolean
}

type SetFormProps = {
  weightStep: number
  initialValues: SetValues
  submitLabel: string
  onSubmit: (values: SetValues) => Promise<void>
  /** Shows a Cancel button when provided (used when editing an existing set). */
  onCancel?: () => void
}

// Shared by logging a new set during a workout and editing a set in history.
export function SetForm({ weightStep, initialValues, submitLabel, onSubmit, onCancel }: SetFormProps) {
  const [weight, setWeight] = useState(initialValues.weight)
  const [reps, setReps] = useState(initialValues.reps)
  const [rpe, setRpe] = useState(initialValues.rpe)
  const [isWarmup, setIsWarmup] = useState(initialValues.isWarmup)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setIsSaving(true)
    try {
      await onSubmit({ weight, reps, rpe, isWarmup })
      // Weight and reps stay as they are: the next set is usually the same.
      // RPE and warmup are per-set judgements, so they reset.
      setRpe(null)
      setIsWarmup(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the set. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Stepper label="Weight" value={weight} onChange={setWeight} step={weightStep} min={0} />
        <Stepper label="Reps" value={reps} onChange={setReps} min={1} />
      </div>

      <fieldset>
        <legend className="text-sm text-slate-300">RPE (optional)</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {RPE_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={rpe === choice}
              // Tapping the selected value again clears it, since RPE is optional.
              onClick={() => setRpe(rpe === choice ? null : choice)}
              className="min-w-12 rounded-lg border border-slate-700 px-3 py-3 aria-pressed:border-emerald-400 aria-pressed:bg-emerald-950"
            >
              {choice}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        aria-pressed={isWarmup}
        onClick={() => setIsWarmup(!isWarmup)}
        className="w-full rounded-lg border border-slate-700 py-3 aria-pressed:border-amber-400 aria-pressed:bg-amber-950"
      >
        {isWarmup ? 'Warmup set ✓' : 'Mark as warmup'}
      </button>

      {error && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-slate-700 py-4 text-lg disabled:opacity-60"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="flex-1 rounded-lg bg-emerald-500 py-4 text-lg font-semibold text-slate-950 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
