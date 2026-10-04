import { useEffect, useState } from 'react'
import { onSessionChange, type Session } from '../../api/auth'

export function useSession(): { session: Session | null; isLoading: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  // Supabase restores a saved session asynchronously, so until the first callback
  // we don't know yet whether the user is signed in.
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onSessionChange((newSession) => {
      setSession(newSession)
      setIsLoading(false)
    })
    return unsubscribe
  }, [])

  return { session, isLoading }
}
