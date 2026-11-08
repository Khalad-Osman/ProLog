import { useId, useState } from 'react'

type StepperProps = {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  /** Weights can be 102.5; reps can't. Decides the keyboard and what typing accepts. */
  allowDecimals?: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Avoids 0.1 + 0.2 style float noise. Two decimals matches the database's numeric columns. */
function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * Turns typed text into a value, or null if it isn't a usable number. A comma is
 * accepted as the decimal point, since many phone keyboards only offer a comma.
 */
function parseTypedValue(text: string, allowDecimals: boolean): number | null {
  const normalized = text.trim().replace(',', '.')
  if (normalized === '') {
    return null
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return allowDecimals ? roundToTwoDecimals(parsed) : Math.round(parsed)
}

// Big +/- buttons for the usual small change mid-set, and a typeable value for big
// jumps (e.g. 205 to 315 would be 22 taps). Typing only opens the keyboard if the
// number itself is tapped.
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = Infinity,
  allowDecimals = false,
}: StepperProps) {
  // What's in the box while typing. Null when not editing, so the box shows `value`.
  // Kept separate so half-typed text like "10" on the way to "102.5" isn't applied.
  const [draft, setDraft] = useState<string | null>(null)
  // Unique per stepper: the Workout screen shows a "Weight" stepper for every exercise.
  const inputId = useId()

  function change(delta: number) {
    onChange(clamp(roundToTwoDecimals(value + delta), min, max))
  }

  function commitDraft() {
    if (draft !== null) {
      const typed = parseTypedValue(draft, allowDecimals)
      // Invalid or empty input just goes back to the previous value.
      if (typed !== null) {
        onChange(clamp(typed, min, max))
      }
    }
    setDraft(null)
  }

  return (
    <div>
      <label htmlFor={inputId} className="text-sm text-slate-300">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => change(-step)}
          disabled={value <= min}
          className="h-14 w-14 shrink-0 rounded-lg bg-slate-800 text-2xl font-bold disabled:opacity-40"
        >
          −
        </button>
        <input
          id={inputId}
          type="text"
          // A numeric keypad on phones; "decimal" adds the decimal point key.
          inputMode={allowDecimals ? 'decimal' : 'numeric'}
          enterKeyHint="done"
          autoComplete="off"
          value={draft ?? String(value)}
          onFocus={(event) => {
            setDraft(String(value))
            // Select it all, so typing replaces the number instead of appending to it.
            event.target.select()
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur() // commits via onBlur and closes the keyboard
            }
          }}
          className="h-14 w-full min-w-0 rounded-lg bg-transparent text-center text-2xl font-semibold tabular-nums focus:bg-slate-800 focus:outline-2 focus:outline-emerald-500"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => change(step)}
          disabled={value >= max}
          className="h-14 w-14 shrink-0 rounded-lg bg-slate-800 text-2xl font-bold disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  )
}
