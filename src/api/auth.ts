import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Re-exported so features can type sessions without importing Supabase themselves.
export type { Session }

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Creates an account. Returns false when Supabase requires email confirmation,
 * in which case no session exists yet and the user must check their inbox.
 */
export async function signUp(email: string, password: string): Promise<{ signedIn: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    throw new Error(error.message)
  }
  return { signedIn: data.session !== null }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Calls back with the current session immediately, then again on every sign-in
 * or sign-out. Returns a function that stops listening.
 */
export function onSessionChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => data.subscription.unsubscribe()
}
