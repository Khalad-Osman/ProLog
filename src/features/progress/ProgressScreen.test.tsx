import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listExercises, type Exercise } from '../../api/exercises'
import { getExerciseProgress } from '../../api/workouts'
import type { DatedSession } from '../../domain/progress'
import { ProgressScreen } from './ProgressScreen'

vi.mock('../../api/exercises')
vi.mock('../../api/workouts')

const bench: Exercise = { id: 'ex-bench', name: 'Bench press', repMin: 8, repMax: 12, increment: 2.5 }
const squat: Exercise = { id: 'ex-squat', name: 'Squat', repMin: 5, repMax: 8, increment: 5 }

function session(performedAt: string, weight: number, reps: number): DatedSession {
  return { performedAt, sets: [{ weight, reps, rpe: null, isWarmup: false }] }
}

// Newest first, as the API returns them.
const benchSessions = [
  session('2026-10-08T18:00:00Z', 102.5, 8),
  session('2026-10-01T18:00:00Z', 100, 12),
]

describe('ProgressScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(listExercises).mockResolvedValue([bench, squat])
    vi.mocked(getExerciseProgress).mockResolvedValue(benchSessions)
  })

  it('shows the first exercise with its latest values and a described chart', async () => {
    render(<ProgressScreen />)

    // 102.5 × (1 + 8/30) = 129.8
    const chart = await screen.findByRole('img')
    expect(chart).toHaveAccessibleName(
      'Bench press over 2 sessions: top weight went from 100 to 102.5, estimated 1RM from 140 to 129.8.',
    )
    expect(screen.getByLabelText('Exercise')).toHaveValue(bench.id)
    expect(screen.getByText('102.5')).toBeInTheDocument()
    expect(screen.getByText('129.8')).toBeInTheDocument()
    expect(getExerciseProgress).toHaveBeenCalledWith(bench.id)
  })

  it('loads progress for another exercise when selected', async () => {
    vi.mocked(getExerciseProgress)
      .mockResolvedValueOnce(benchSessions)
      .mockResolvedValueOnce([session('2026-10-02T18:00:00Z', 140, 5), session('2026-09-25T18:00:00Z', 135, 5)])
    render(<ProgressScreen />)
    await screen.findByRole('img')

    fireEvent.change(screen.getByLabelText('Exercise'), { target: { value: squat.id } })

    expect(await screen.findByRole('img', { name: /^Squat over 2 sessions/ })).toBeInTheDocument()
    expect(getExerciseProgress).toHaveBeenLastCalledWith(squat.id)
  })

  it('shows the data as a table, newest first', async () => {
    render(<ProgressScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Show as table' }))

    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(3) // header + 2 sessions
    expect(rows[1]).toHaveTextContent('102.5 × 8')
    expect(rows[1]).toHaveTextContent('129.8')
    expect(rows[2]).toHaveTextContent('100 × 12')
    expect(screen.getByRole('button', { name: 'Hide table' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('asks for another session when there is only one', async () => {
    vi.mocked(getExerciseProgress).mockResolvedValue([session('2026-10-01T18:00:00Z', 100, 8)])
    render(<ProgressScreen />)

    expect(await screen.findByText(/log another session/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('explains when an exercise has no sessions yet', async () => {
    vi.mocked(getExerciseProgress).mockResolvedValue([])
    render(<ProgressScreen />)

    expect(await screen.findByText(/no working sets logged for bench press/i)).toBeInTheDocument()
  })

  it('prompts to add exercises when there are none', async () => {
    vi.mocked(listExercises).mockResolvedValue([])
    render(<ProgressScreen />)

    expect(await screen.findByText(/add exercises/i)).toBeInTheDocument()
    expect(getExerciseProgress).not.toHaveBeenCalled()
  })

  it('shows an error loading progress and retries', async () => {
    vi.mocked(getExerciseProgress)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(benchSessions)
    render(<ProgressScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('img')).toBeInTheDocument()
  })

  it('shows an error loading exercises and retries', async () => {
    vi.mocked(listExercises)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce([bench])
    render(<ProgressScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Exercise')).toHaveValue(bench.id)
    })
  })
})
