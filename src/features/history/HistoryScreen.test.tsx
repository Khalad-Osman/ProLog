import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listPastWorkouts, type PastWorkout } from '../../api/workouts'
import { HistoryScreen } from './HistoryScreen'

vi.mock('../../api/workouts')

function pastWorkout(id: string, overrides: Partial<PastWorkout> = {}): PastWorkout {
  return {
    id,
    performedAt: '2026-10-01T18:00:00Z',
    notes: null,
    exercises: [
      {
        exerciseId: 'bench',
        exerciseName: 'Bench press',
        sets: [
          { id: `${id}-1`, exerciseId: 'bench', exerciseName: 'Bench press', weight: 60, reps: 10, rpe: null, isWarmup: true },
          { id: `${id}-2`, exerciseId: 'bench', exerciseName: 'Bench press', weight: 100, reps: 8, rpe: 8.5, isWarmup: false },
        ],
      },
    ],
    ...overrides,
  }
}

describe('HistoryScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows a loading state, then past workouts with their sets', async () => {
    vi.mocked(listPastWorkouts).mockResolvedValue({ workouts: [pastWorkout('w1')], hasMore: false })
    render(<HistoryScreen />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(await screen.findByText('Bench press')).toBeInTheDocument()
    expect(screen.getByText('100 × 8 @ RPE 8.5')).toBeInTheDocument()
    expect(screen.getByText('60 × 10')).toBeInTheDocument()
    expect(screen.getByText('warmup')).toBeInTheDocument()
    expect(listPastWorkouts).toHaveBeenCalledWith(0)
  })

  it('shows workout notes', async () => {
    vi.mocked(listPastWorkouts).mockResolvedValue({
      workouts: [pastWorkout('w1', { notes: 'Shoulder felt tight' })],
      hasMore: false,
    })
    render(<HistoryScreen />)

    expect(await screen.findByText('Shoulder felt tight')).toBeInTheDocument()
  })

  it('shows a workout that has notes but no sets', async () => {
    vi.mocked(listPastWorkouts).mockResolvedValue({
      workouts: [pastWorkout('w1', { notes: 'Skipped, knee sore', exercises: [] })],
      hasMore: false,
    })
    render(<HistoryScreen />)

    expect(await screen.findByText('Skipped, knee sore')).toBeInTheDocument()
    expect(screen.getByText('No sets logged.')).toBeInTheDocument()
  })

  it('shows an empty state when there are no workouts', async () => {
    vi.mocked(listPastWorkouts).mockResolvedValue({ workouts: [], hasMore: false })
    render(<HistoryScreen />)

    expect(await screen.findByText(/no workouts yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /load older/i })).not.toBeInTheDocument()
  })

  it('shows an error and retries', async () => {
    vi.mocked(listPastWorkouts)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({ workouts: [pastWorkout('w1')], hasMore: false })
    render(<HistoryScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Bench press')).toBeInTheDocument()
  })

  it('loads older workouts page by page', async () => {
    vi.mocked(listPastWorkouts)
      .mockResolvedValueOnce({ workouts: [pastWorkout('w1')], hasMore: true })
      .mockResolvedValueOnce({
        workouts: [pastWorkout('w2', { performedAt: '2026-09-20T18:00:00Z', notes: 'Older one' })],
        hasMore: false,
      })
    render(<HistoryScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Load older workouts' }))

    expect(await screen.findByText('Older one')).toBeInTheDocument()
    expect(listPastWorkouts).toHaveBeenLastCalledWith(1)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    // Last page reached, so the button goes away.
    expect(screen.queryByRole('button', { name: 'Load older workouts' })).not.toBeInTheDocument()
  })

  it('keeps loaded workouts and shows an error when loading more fails', async () => {
    vi.mocked(listPastWorkouts)
      .mockResolvedValueOnce({ workouts: [pastWorkout('w1')], hasMore: true })
      .mockRejectedValueOnce(new Error('Timed out'))
    render(<HistoryScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Load older workouts' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Timed out')
    const [card] = screen.getAllByRole('article')
    expect(within(card).getByText('Bench press')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load older workouts' })).toBeEnabled()
  })
})
