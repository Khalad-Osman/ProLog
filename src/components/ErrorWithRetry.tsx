export function ErrorWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
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
