import { useState, type FormEvent } from 'react'
import { signIn, signUp, startDemo } from '../../api/auth'

type Mode = 'sign-in' | 'sign-up'

// Supabase's default minimum; checking it here gives a clearer message than the server error.
const MIN_PASSWORD_LENGTH = 6

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const isSignUp = mode === 'sign-up'

  function switchMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up')
    setError(null)
    setMessage(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    setIsSubmitting(true)
    try {
      if (isSignUp) {
        const { signedIn } = await signUp(email, password)
        if (!signedIn) {
          setMessage('Account created. Check your email to confirm it, then sign in.')
        }
      } else {
        await signIn(email, password)
      }
      // On success the session listener in App swaps this screen out, so there's nothing else to do.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleStartDemo() {
    setError(null)
    setMessage(null)
    setIsSubmitting(true)
    try {
      await startDemo()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the demo. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold">ProLog</h1>
        <p className="mt-1 text-slate-400">
          {isSignUp ? 'Create an account to start logging.' : 'Sign in to log your workout.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm text-slate-300">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-lg"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-300">Password</span>
            <input
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-lg"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="rounded-lg bg-emerald-950 px-4 py-3 text-emerald-200">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-500 py-4 text-lg font-semibold text-slate-950 disabled:opacity-60"
          >
            {getSubmitLabel(isSignUp, isSubmitting)}
          </button>
        </form>

        <button
          type="button"
          onClick={switchMode}
          className="mt-6 w-full py-3 text-slate-400 underline"
        >
          {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>

        <div className="mt-6 border-t border-slate-800 pt-6">
          <button
            type="button"
            onClick={handleStartDemo}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-emerald-700 py-4 text-lg font-semibold text-emerald-300 disabled:opacity-60"
          >
            Try the demo
          </button>
          <p className="mt-2 text-center text-sm text-slate-400">
            No sign-up. Comes with a few weeks of sample workouts.
          </p>
        </div>
      </div>
    </main>
  )
}

function getSubmitLabel(isSignUp: boolean, isSubmitting: boolean): string {
  if (isSubmitting) {
    return isSignUp ? 'Creating account…' : 'Signing in…'
  }
  return isSignUp ? 'Create account' : 'Sign in'
}
