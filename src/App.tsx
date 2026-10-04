import { useState } from 'react'
import { signOut, type Session } from './api/auth'
import { AuthScreen } from './features/auth/AuthScreen'
import { useSession } from './features/auth/useSession'
import { ExercisesScreen } from './features/exercises/ExercisesScreen'

function App() {
  const { session, isLoading } = useSession()

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <p role="status">Loading…</p>
      </main>
    )
  }

  if (session === null) {
    return <AuthScreen />
  }

  return <SignedInHome session={session} />
}

// The signed-in shell. Exercises is the only screen for now; navigation comes with the workout screen.
function SignedInHome({ session }: { session: Session }) {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setError(null)
    setIsSigningOut(true)
    try {
      await signOut()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign out. Please try again.')
      setIsSigningOut(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-slate-950 p-4 text-slate-100">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">ProLog</h1>
          <p className="truncate text-sm text-slate-400">Signed in as {session.user.email}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="shrink-0 rounded-lg border border-slate-700 px-4 py-3 disabled:opacity-60"
        >
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      <ExercisesScreen />
    </main>
  )
}

export default App
