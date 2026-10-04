export type NotesStatus = 'idle' | 'saving' | 'saved' | 'error'

// Generous for a few lines about sleep, pain or form cues, without letting the column grow unbounded.
export const MAX_NOTES_LENGTH = 1000

type WorkoutNotesProps = {
  value: string
  status: NotesStatus
  onChange: (value: string) => void
  onBlur: () => void
}

export function WorkoutNotes({ value, status, onChange, onBlur }: WorkoutNotesProps) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm text-slate-300">
        Notes
        <NotesStatusText status={status} />
      </span>
      <textarea
        value={value}
        maxLength={MAX_NOTES_LENGTH}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder="How did it feel? Sleep, aches, form cues…"
        className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3"
      />
    </label>
  )
}

function NotesStatusText({ status }: { status: NotesStatus }) {
  if (status === 'saving') {
    return <span role="status">Saving…</span>
  }
  if (status === 'saved') {
    return <span role="status" className="text-emerald-300">Saved</span>
  }
  if (status === 'error') {
    return (
      <span role="alert" className="text-red-300">
        Not saved. Tap outside to retry.
      </span>
    )
  }
  return null
}
