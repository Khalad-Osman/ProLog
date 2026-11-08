import { useState } from 'react'
import type { Exercise } from '../../api/exercises'
import {
  COACH_PERIOD_WEEKS,
  COACH_TOPICS,
  validateCoachRequest,
  type CoachRequest,
  type CoachTopic,
} from '../../domain/coach'

type CoachFormProps = {
  exercises: Exercise[]
  isGenerating: boolean
  onSubmit: (request: CoachRequest) => void
  onCancel: () => void
}

/** Adds or removes an item, keeping the order of `allInOrder` so requests are predictable. */
function toggle<T>(selected: T[], item: T, allInOrder: T[]): T[] {
  const isSelected = selected.includes(item)
  return allInOrder.filter((candidate) =>
    candidate === item ? !isSelected : selected.includes(candidate),
  )
}

const ALL_TOPIC_IDS = COACH_TOPICS.map((topic) => topic.id)

export function CoachForm({ exercises, isGenerating, onSubmit, onCancel }: CoachFormProps) {
  const allExerciseIds = exercises.map((exercise) => exercise.id)
  // Summary and trends are what most people want; notes are opt-in because they're personal.
  const [topics, setTopics] = useState<CoachTopic[]>(['summary', 'trends'])
  const [weeks, setWeeks] = useState(COACH_PERIOD_WEEKS[0])
  const [exerciseIds, setExerciseIds] = useState<string[]>(allExerciseIds)

  const request: CoachRequest = { topics, weeks, exerciseIds }
  const validationError = validateCoachRequest(request)

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (validationError === null) {
          onSubmit(request)
        }
      }}
    >
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm text-slate-300">What should the coach report on?</legend>
        {COACH_TOPICS.map((topic) => (
          <Checkbox
            key={topic.id}
            label={topic.label}
            checked={topics.includes(topic.id)}
            onChange={() => setTopics(toggle(topics, topic.id, ALL_TOPIC_IDS))}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-slate-300">Time range</legend>
        <div className="grid grid-cols-3 gap-2">
          {COACH_PERIOD_WEEKS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={weeks === option}
              onClick={() => setWeeks(option)}
              className="rounded-lg border border-slate-700 py-3 aria-pressed:border-emerald-500 aria-pressed:bg-emerald-950"
            >
              {option} weeks
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm text-slate-300">Exercises</legend>
        {exercises.map((exercise) => (
          <Checkbox
            key={exercise.id}
            label={exercise.name}
            checked={exerciseIds.includes(exercise.id)}
            onChange={() => setExerciseIds(toggle(exerciseIds, exercise.id, allExerciseIds))}
          />
        ))}
      </fieldset>

      {validationError !== null && <p className="text-sm text-amber-300">{validationError}</p>}

      <button
        type="submit"
        disabled={isGenerating || validationError !== null}
        className="w-full rounded-lg bg-emerald-500 py-4 text-lg font-semibold text-slate-950 disabled:opacity-60"
      >
        {isGenerating ? 'Writing your report…' : 'Generate report'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={isGenerating}
        className="w-full py-3 text-slate-400 underline disabled:opacity-60"
      >
        Cancel
      </button>
    </form>
  )
}

type CheckboxProps = {
  label: string
  checked: boolean
  onChange: () => void
}

function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    // The whole row is the label, so the tap target is the full width, not just the box.
    <label className="flex items-center gap-3 rounded-lg px-2 py-3">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-5 w-5 accent-emerald-500" />
      <span>{label}</span>
    </label>
  )
}
