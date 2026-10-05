import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isDemoSession, onSessionChange, type Session } from './api/auth'
import { listExercises } from './api/exercises'
import { listPastWorkouts } from './api/workouts'
import App from './App'

vi.mock('./api/auth')
vi.mock('./api/exercises')
vi.mock('./api/workouts')

// Only the fields App reads; the cast keeps the test focused on behaviour, not Supabase's full type.
const fakeSession = { user: { email: 'lifter@example.com' } } as Session

function mockSession(session: Session | null) {
  vi.mocked(onSessionChange).mockImplementation((callback) => {
    callback(session)
    return () => {}
  })
}

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

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

  it('opens on the workout tab when signed in', async () => {
    mockSession(fakeSession)
    vi.mocked(listExercises).mockResolvedValue([])
    render(<App />)

    expect(screen.getByText('Signed in as lifter@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Workout' })).toBeInTheDocument()
  })

  it('marks a demo session and offers to leave it', async () => {
    vi.mocked(isDemoSession).mockReturnValue(true)
    mockSession({ user: { email: undefined, is_anonymous: true } } as unknown as Session)
    vi.mocked(listExercises).mockResolvedValue([])
    render(<App />)

    expect(screen.getByText('Demo account')).toBeInTheDocument()
    expect(screen.getByText(/exploring with sample workouts/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave demo' })).toBeInTheDocument()
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Workout' })
  })

  it('switches to the history tab', async () => {
    mockSession(fakeSession)
    vi.mocked(listExercises).mockResolvedValue([])
    vi.mocked(listPastWorkouts).mockResolvedValue({ workouts: [], hasMore: false })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'History' }))

    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument()
  })

  it('switches to the progress tab', async () => {
    mockSession(fakeSession)
    vi.mocked(listExercises).mockResolvedValue([])
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Progress' }))

    // The tab is lazy-loaded, and the first import compiles the chart library. On a
    // busy machine that can exceed both findBy's 1s default and Vitest's 5s test limit.
    expect(
      await screen.findByRole('heading', { name: 'Progress' }, { timeout: 20_000 }),
    ).toBeInTheDocument()
  }, 30_000)

  it('switches to the exercises tab', async () => {
    mockSession(fakeSession)
    vi.mocked(listExercises).mockResolvedValue([])
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Exercises' }))

    expect(await screen.findByRole('heading', { name: 'Exercises' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exercises' })).toHaveAttribute('aria-current', 'page')
  })
})
