import { lazy, Suspense, useState } from 'react'
import { isDemoSession, signOut, type Session } from './api/auth'
import { AuthScreen } from './features/auth/AuthScreen'
import { useSession } from './features/auth/useSession'
import { ExercisesScreen } from './features/exercises/ExercisesScreen'
import { HistoryScreen } from './features/history/HistoryScreen'
import { WorkoutScreen } from './features/workout/WorkoutScreen'

// Loaded on first visit to the tab: the chart library roughly doubles the bundle,
// and the Workout screen (what you open at the gym) shouldn't wait for it.
const ProgressScreen = lazy(() =>
  import('./features/progress/ProgressScreen').then((module) => ({ default: module.ProgressScreen })),
)

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

type Tab = 'workout' | 'history' | 'progress' | 'exercises'

const TABS: { id: Tab; label: string }[] = [
  { id: 'workout', label: 'Workout' },
  { id: 'history', label: 'History' },
  { id: 'progress', label: 'Progress' },
  { id: 'exercises', label: 'Exercises' },
]

function TabScreen({ tab }: { tab: Tab }) {
  if (tab === 'workout') {
    return <WorkoutScreen />
  }
  if (tab === 'history') {
    return <HistoryScreen />
  }
  if (tab === 'progress') {
    return (
      <Suspense fallback={<p role="status" className="text-slate-400">Loading…</p>}>
        <ProgressScreen />
      </Suspense>
    )
  }
  return <ExercisesScreen />
}

// The signed-in shell. A handful of tabs doesn't justify a router dependency, so plain state picks the screen.
function SignedInHome({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('workout')
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

  const isDemo = isDemoSession(session)
  const signOutLabel = isDemo ? 'Leave demo' : 'Sign out'

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-slate-950 p-4 text-slate-100">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">ProLog</h1>
          <p className="truncate text-sm text-slate-400">
            {isDemo ? 'Demo account' : `Signed in as ${session.user.email}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="shrink-0 rounded-lg border border-slate-700 px-4 py-3 disabled:opacity-60"
        >
          {isSigningOut ? 'Signing out…' : signOutLabel}
        </button>
      </header>

      {isDemo && (
        <p className="mb-6 rounded-lg border border-emerald-800 bg-emerald-950/50 px-4 py-3 text-sm text-slate-300">
          You're exploring with sample workouts. Log a set, check History and Progress. Leaving the
          demo ends this session for good.
        </p>
      )}

      <nav className="mb-6 grid grid-cols-4 gap-1 rounded-xl bg-slate-900 p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
            className="rounded-lg py-3 text-sm font-medium text-slate-400 aria-[current=page]:bg-slate-700 aria-[current=page]:text-slate-100"
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      <TabScreen tab={tab} />
    </main>
  )
}

export default App
