import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { onSessionChange, type Session } from './api/auth'
import { listExercises } from './api/exercises'
import App from './App'

vi.mock('./api/auth')
vi.mock('./api/exercises')

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

  it('shows the signed-in user and their exercises when signed in', async () => {
    mockSession(fakeSession)
    vi.mocked(listExercises).mockResolvedValue([])
    render(<App />)

    expect(screen.getByText('Signed in as lifter@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Exercises' })).toBeInTheDocument()
  })
})
