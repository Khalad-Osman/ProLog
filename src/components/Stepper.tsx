type StepperProps = {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
}

// Big +/- buttons instead of a number input: easier to hit mid-set, and no phone keyboard.
export function Stepper({ label, value, onChange, step = 1, min = 0, max = Infinity }: StepperProps) {
  function change(delta: number) {
    const next = Number((value + delta).toFixed(2)) // avoid 0.1 + 0.2 style float noise
    onChange(Math.min(max, Math.max(min, next)))
  }

  return (
    <div>
      <span className="text-sm text-slate-300">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => change(-step)}
          disabled={value <= min}
          className="h-14 w-14 rounded-lg bg-slate-800 text-2xl font-bold disabled:opacity-40"
        >
          −
        </button>
        <output aria-label={label} className="flex-1 text-center text-2xl font-semibold tabular-nums">
          {value}
        </output>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => change(step)}
          disabled={value >= max}
          className="h-14 w-14 rounded-lg bg-slate-800 text-2xl font-bold disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  )
}
