import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteSet,
  deleteWorkout,
  listPastWorkouts,
  updateSet,
  updateWorkoutNotes,
  type PastWorkout,
} from '../../api/workouts'
import type { NamedSet } from '../../domain/history'
import { HistoryScreen } from './HistoryScreen'

vi.mock('../../api/workouts')

function benchSet(id: string, values: Partial<NamedSet>): NamedSet {
  return {
    id,
    exerciseId: 'bench',
    exerciseName: 'Bench press',
    exerciseIncrement: 2.5,
    weight: 100,
    reps: 8,
    rpe: null,
    isWarmup: false,
    ...values,
  }
}

function pastWorkout(id: string, overrides: Partial<PastWorkout> = {}): PastWorkout {
  return {
    id,
    performedAt: '2026-10-01T18:00:00Z',
    notes: null,
    exercises: [
      {
        exerciseId: 'bench',
        exerciseName: 'Bench press',
        increment: 2.5,
        sets: [
          benchSet(`${id}-1`, { weight: 60, reps: 10, isWarmup: true }),
          benchSet(`${id}-2`, { weight: 100, reps: 8, rpe: 8.5 }),
        ],
      },
    ],
    ...overrides,
  }
}

function showWorkouts(workouts: PastWorkout[], hasMore = false) {
  vi.mocked(listPastWorkouts).mockResolvedValue({ workouts, hasMore })
}

async function openEditor(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  return screen.getByRole('article')
}

describe('HistoryScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading state, then past workouts with their sets', async () => {
    showWorkouts([pastWorkout('w1')])
    render(<HistoryScreen />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(await screen.findByText('Bench press')).toBeInTheDocument()
    expect(screen.getByText('100 × 8 @ RPE 8.5')).toBeInTheDocument()
    expect(screen.getByText('60 × 10')).toBeInTheDocument()
    expect(screen.getByText('warmup')).toBeInTheDocument()
    expect(listPastWorkouts).toHaveBeenCalledWith(0)
  })

  it('shows workout notes', async () => {
    showWorkouts([pastWorkout('w1', { notes: 'Shoulder felt tight' })])
    render(<HistoryScreen />)

    expect(await screen.findByText('Shoulder felt tight')).toBeInTheDocument()
  })

  it('shows a workout that has notes but no sets', async () => {
    showWorkouts([pastWorkout('w1', { notes: 'Skipped, knee sore', exercises: [] })])
    render(<HistoryScreen />)

    expect(await screen.findByText('Skipped, knee sore')).toBeInTheDocument()
    expect(screen.getByText('No sets logged.')).toBeInTheDocument()
  })

  it('shows an empty state when there are no workouts', async () => {
    showWorkouts([])
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

  it('loads older workouts', async () => {
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

  describe('editing', () => {
    it('edits notes and saves them on Done', async () => {
      showWorkouts([pastWorkout('w1', { notes: 'Old note' })])
      vi.mocked(updateWorkoutNotes).mockResolvedValue()
      render(<HistoryScreen />)

      await openEditor()
      const notes = screen.getByLabelText('Notes')
      expect(notes).toHaveValue('Old note')
      fireEvent.change(notes, { target: { value: '  New note  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      // Wait for view mode first: until then "New note" is also the text box's content.
      expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.getByText('New note')).toBeInTheDocument()
      expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
      expect(updateWorkoutNotes).toHaveBeenCalledWith('w1', 'New note')
    })

    it('does not save notes that did not change', async () => {
      showWorkouts([pastWorkout('w1')])
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(updateWorkoutNotes).not.toHaveBeenCalled()
    })

    it('stays in edit mode when notes fail to save', async () => {
      showWorkouts([pastWorkout('w1')])
      vi.mocked(updateWorkoutNotes).mockRejectedValue(new Error('offline'))
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Felt strong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('offline')
      expect(screen.getByLabelText('Notes')).toHaveValue('Felt strong')
    })

    it('edits a set', async () => {
      showWorkouts([pastWorkout('w1')])
      vi.mocked(updateSet).mockResolvedValue()
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: 'Edit Bench press set 2' }))
      // The form starts from the set's current values, including its RPE.
      expect(screen.getByLabelText('Weight')).toHaveTextContent('100')
      expect(screen.getByRole('button', { name: '8.5' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'Increase Reps' }))
      fireEvent.click(screen.getByRole('button', { name: 'Increase Weight' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save set' }))

      expect(await screen.findByText('102.5 × 9 @ RPE 8.5')).toBeInTheDocument()
      expect(updateSet).toHaveBeenCalledWith('w1-2', {
        weight: 102.5,
        reps: 9,
        rpe: 8.5,
        isWarmup: false,
      })
    })

    it('cancels editing a set without saving', async () => {
      showWorkouts([pastWorkout('w1')])
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: 'Edit Bench press set 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Increase Reps' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByText('100 × 8 @ RPE 8.5')).toBeInTheDocument()
      expect(updateSet).not.toHaveBeenCalled()
    })

    it('shows an error when a set fails to save', async () => {
      showWorkouts([pastWorkout('w1')])
      vi.mocked(updateSet).mockRejectedValue(new Error('Connection lost'))
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: 'Edit Bench press set 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save set' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
      expect(screen.getByRole('button', { name: 'Save set' })).toBeInTheDocument()
    })

    it('deletes a set', async () => {
      showWorkouts([pastWorkout('w1')])
      vi.mocked(deleteSet).mockResolvedValue()
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: 'Delete Bench press set 1' }))

      await waitFor(() => {
        expect(screen.queryByText('60 × 10')).not.toBeInTheDocument()
      })
      expect(deleteSet).toHaveBeenCalledWith('w1-1')
      expect(screen.getByText('100 × 8 @ RPE 8.5')).toBeInTheDocument()
    })

    it('deletes a workout after confirmation', async () => {
      showWorkouts([pastWorkout('w1')])
      vi.mocked(deleteWorkout).mockResolvedValue()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: 'Delete workout' }))

      expect(await screen.findByText(/no workouts yet/i)).toBeInTheDocument()
      expect(deleteWorkout).toHaveBeenCalledWith('w1')
    })

    it('does not delete a workout when the confirmation is cancelled', async () => {
      showWorkouts([pastWorkout('w1')])
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<HistoryScreen />)

      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: 'Delete workout' }))

      expect(deleteWorkout).not.toHaveBeenCalled()
      expect(screen.getByRole('article')).toBeInTheDocument()
    })

    it('loads older workouts from the right place after a delete', async () => {
      vi.mocked(listPastWorkouts)
        .mockResolvedValueOnce({ workouts: [pastWorkout('w1'), pastWorkout('w2')], hasMore: true })
        .mockResolvedValueOnce({ workouts: [], hasMore: false })
      vi.mocked(deleteWorkout).mockResolvedValue()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      render(<HistoryScreen />)

      const [firstCard] = await screen.findAllByRole('article')
      fireEvent.click(within(firstCard).getByRole('button', { name: 'Edit' }))
      fireEvent.click(within(firstCard).getByRole('button', { name: 'Delete workout' }))
      await waitFor(() => {
        expect(screen.getAllByRole('article')).toHaveLength(1)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Load older workouts' }))

      // One workout left loaded, so the next request starts at 1, not 2.
      await waitFor(() => {
        expect(listPastWorkouts).toHaveBeenLastCalledWith(1)
      })
    })
  })
})
