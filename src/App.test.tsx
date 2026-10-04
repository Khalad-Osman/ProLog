import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { onSessionChange, type Session } from './api/auth'
import App from './App'

vi.mock('./api/auth')

// Only the fields App reads; the cast keeps the test focused on behaviour, not Supabase's full type.
const fakeSession = { user: { email: 'lifter@example.com' } } as Session

function mockSession(session: Session | null) {
  vi.mocked(onSessionChange).mockImplementation((callback) => {
    callback(session)
    return () => {}
  })
}

describe('App', () => {
  it('shows a loading state until the session is known', () => {
    // Never calls back, like Supabase still restoring the session.
    vi.mocked(onSessionChange).mockReturnValue(() => {})
    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('shows the sign-in screen when signed out', () => {
    mockSession(null)
    render(<App />)

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the signed-in user when signed in', () => {
    mockSession(fakeSession)
    render(<App />)

    expect(screen.getByText('Signed in as lifter@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
