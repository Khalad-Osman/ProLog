import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listExercises, type Exercise } from '../../api/exercises'
import {
  addSet,
  createWorkout,
  deleteSet,
  deleteWorkout,
  getExerciseHistory,
  getWorkout,
  listWorkoutSets,
  updateWorkoutNotes,
  type WorkoutSet,
} from '../../api/workouts'
import type { Session } from '../../domain/progression'
import { loadStoredWorkout, saveStoredWorkout } from './activeWorkoutStorage'
import { WorkoutScreen } from './WorkoutScreen'

vi.mock('../../api/exercises')
vi.mock('../../api/workouts')

const bench: Exercise = { id: 'ex-bench', name: 'Bench press', repMin: 8, repMax: 12, increment: 2.5 }
const squat: Exercise = { id: 'ex-squat', name: 'Squat', repMin: 5, repMax: 8, increment: 5 }

// Last session: every bench set hit 12 reps at 100, so the engine says add weight.
const benchHistoryReadyToIncrease: Session[] = [
  {
    sets: [
      { weight: 100, reps: 12, rpe: 8, isWarmup: false },
      { weight: 100, reps: 12, rpe: 8.5, isWarmup: false },
    ],
  },
]

function loggedSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'set-1',
    exerciseId: bench.id,
    setOrder: 1,
    reps: 8,
    weight: 102.5,
    rpe: null,
    isWarmup: false,
    ...overrides,
  }
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

async function startWorkoutWith(exercise: Exercise) {
  fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Add exercise' }))
  fireEvent.click(screen.getByRole('button', { name: exercise.name }))
  return screen.findByRole('region', { name: exercise.name })
}

describe('WorkoutScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    vi.mocked(listExercises).mockResolvedValue([bench, squat])
    vi.mocked(createWorkout).mockResolvedValue({ id: 'workout-1', performedAt: hoursAgo(0), notes: null })
    vi.mocked(getExerciseHistory).mockResolvedValue(benchHistoryReadyToIncrease)
  })

  it('cannot start a workout before any exercises exist', async () => {
    vi.mocked(listExercises).mockResolvedValue([])
    render(<WorkoutScreen />)

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeDisabled()
    expect(screen.getByText(/add your exercises/i)).toBeInTheDocument()
  })

  it('shows a load error and retries', async () => {
    vi.mocked(listExercises)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([bench])
    render(<WorkoutScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeEnabled()
  })

  it('shows the recommendation and pre-fills the steppers with it', async () => {
    render(<WorkoutScreen />)

    const card = await startWorkoutWith(bench)

    expect(await within(card).findByText('Add weight: 102.5 × 8')).toBeInTheDocument()
    expect(within(card).getByLabelText('Weight')).toHaveTextContent('102.5')
    expect(within(card).getByLabelText('Reps')).toHaveTextContent('8')
    expect(getExerciseHistory).toHaveBeenCalledWith(bench.id, 'workout-1')
  })

  it('prompts for a first session when there is no history', async () => {
    vi.mocked(getExerciseHistory).mockResolvedValue([])
    render(<WorkoutScreen />)

    const card = await startWorkoutWith(bench)

    expect(await within(card).findByText('First session')).toBeInTheDocument()
    expect(within(card).getByText(/log your first session/i)).toBeInTheDocument()
  })

  it('logs a set with RPE and shows it in the list', async () => {
    vi.mocked(addSet).mockResolvedValue(loggedSet({ rpe: 8 }))
    render(<WorkoutScreen />)

    const card = await startWorkoutWith(bench)
    await within(card).findByText('Add weight: 102.5 × 8')
    fireEvent.click(within(card).getByRole('button', { name: '8' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Log set' }))

    await waitFor(() => {
      expect(addSet).toHaveBeenCalledWith({
        workoutId: 'workout-1',
        exerciseId: bench.id,
        setOrder: 1,
        weight: 102.5,
        reps: 8,
        rpe: 8,
        isWarmup: false,
      })
    })
    expect(await within(card).findByText(/102\.5 × 8 @ RPE 8/)).toBeInTheDocument()
  })

  it('logs a warmup set', async () => {
    vi.mocked(addSet).mockResolvedValue(loggedSet({ isWarmup: true }))
    render(<WorkoutScreen />)

    const card = await startWorkoutWith(bench)
    await within(card).findByText('Add weight: 102.5 × 8')
    fireEvent.click(within(card).getByRole('button', { name: 'Mark as warmup' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Log set' }))

    await waitFor(() => {
      expect(addSet).toHaveBeenCalledWith(expect.objectContaining({ isWarmup: true }))
    })
    expect(await within(card).findByText('warmup')).toBeInTheDocument()
  })

  it('shows an error when a set fails to save', async () => {
    vi.mocked(addSet).mockRejectedValue(new Error('Connection lost'))
    render(<WorkoutScreen />)

    const card = await startWorkoutWith(bench)
    await within(card).findByText('Add weight: 102.5 × 8')
    fireEvent.click(within(card).getByRole('button', { name: 'Log set' }))

    expect(await within(card).findByRole('alert')).toHaveTextContent('Connection lost')
  })

  it('still allows logging when history fails to load', async () => {
    vi.mocked(getExerciseHistory).mockRejectedValue(new Error('History unavailable'))
    render(<WorkoutScreen />)

    const card = await startWorkoutWith(bench)

    expect(await within(card).findByRole('alert')).toHaveTextContent('History unavailable')
    expect(within(card).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Log set' })).toBeInTheDocument()
  })

  it('remembers the active workout on this device', async () => {
    render(<WorkoutScreen />)

    await startWorkoutWith(bench)

    expect(loadStoredWorkout()).toEqual({ workoutId: 'workout-1', exerciseIds: [bench.id] })
  })

  it('resumes an unfinished workout, starting from the last logged set', async () => {
    saveStoredWorkout({ workoutId: 'workout-1', exerciseIds: [bench.id] })
    vi.mocked(getWorkout).mockResolvedValue({ id: 'workout-1', performedAt: hoursAgo(1), notes: null })
    vi.mocked(listWorkoutSets).mockResolvedValue([loggedSet({ weight: 100, reps: 10 })])
    render(<WorkoutScreen />)

    const card = await screen.findByRole('region', { name: bench.name })

    expect(within(card).getByText(/100 × 10/)).toBeInTheDocument()
    expect(await within(card).findByLabelText('Weight')).toHaveTextContent('100')
    expect(within(card).getByLabelText('Reps')).toHaveTextContent('10')
  })

  it('does not resume a workout that is too old', async () => {
    saveStoredWorkout({ workoutId: 'old-workout', exerciseIds: [bench.id] })
    vi.mocked(getWorkout).mockResolvedValue({ id: 'old-workout', performedAt: hoursAgo(24), notes: null })
    render(<WorkoutScreen />)

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(loadStoredWorkout()).toBeNull()
    expect(listWorkoutSets).not.toHaveBeenCalled()
  })

  it('deletes a logged set', async () => {
    saveStoredWorkout({ workoutId: 'workout-1', exerciseIds: [bench.id] })
    vi.mocked(getWorkout).mockResolvedValue({ id: 'workout-1', performedAt: hoursAgo(1), notes: null })
    vi.mocked(listWorkoutSets).mockResolvedValue([loggedSet()])
    vi.mocked(deleteSet).mockResolvedValue()
    render(<WorkoutScreen />)

    const card = await screen.findByRole('region', { name: bench.name })
    fireEvent.click(await within(card).findByRole('button', { name: 'Delete set 1' }))

    await waitFor(() => {
      expect(deleteSet).toHaveBeenCalledWith('set-1')
    })
    // Check the row's own button: "102.5 × 8" also appears in the recommendation box.
    await waitFor(() => {
      expect(within(card).queryByRole('button', { name: 'Delete set 1' })).not.toBeInTheDocument()
    })
  })

  it('deletes an empty workout when finishing, so it does not clutter history', async () => {
    vi.mocked(deleteWorkout).mockResolvedValue()
    render(<WorkoutScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish workout' }))

    await waitFor(() => {
      expect(deleteWorkout).toHaveBeenCalledWith('workout-1')
    })
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(loadStoredWorkout()).toBeNull()
  })

  it('keeps a workout with sets when finishing', async () => {
    saveStoredWorkout({ workoutId: 'workout-1', exerciseIds: [bench.id] })
    vi.mocked(getWorkout).mockResolvedValue({ id: 'workout-1', performedAt: hoursAgo(1), notes: null })
    vi.mocked(listWorkoutSets).mockResolvedValue([loggedSet()])
    render(<WorkoutScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Finish workout' }))

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(deleteWorkout).not.toHaveBeenCalled()
  })

  describe('notes', () => {
    it('saves notes when the box loses focus', async () => {
      vi.mocked(updateWorkoutNotes).mockResolvedValue()
      render(<WorkoutScreen />)

      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
      const notes = await screen.findByLabelText(/notes/i)
      fireEvent.change(notes, { target: { value: 'Slept badly, shoulder ok' } })
      fireEvent.blur(notes)

      await waitFor(() => {
        expect(updateWorkoutNotes).toHaveBeenCalledWith('workout-1', 'Slept badly, shoulder ok')
      })
      expect(await screen.findByText('Saved')).toBeInTheDocument()
    })

    it('does not save when nothing changed', async () => {
      render(<WorkoutScreen />)

      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
      fireEvent.blur(await screen.findByLabelText(/notes/i))

      expect(updateWorkoutNotes).not.toHaveBeenCalled()
    })

    it('shows when notes fail to save', async () => {
      vi.mocked(updateWorkoutNotes).mockRejectedValue(new Error('offline'))
      render(<WorkoutScreen />)

      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
      const notes = await screen.findByLabelText(/notes/i)
      fireEvent.change(notes, { target: { value: 'Felt strong' } })
      fireEvent.blur(notes)

      expect(await screen.findByRole('alert')).toHaveTextContent(/not saved/i)
    })

    it('restores saved notes when resuming a workout', async () => {
      saveStoredWorkout({ workoutId: 'workout-1', exerciseIds: [] })
      vi.mocked(getWorkout).mockResolvedValue({
        id: 'workout-1',
        performedAt: hoursAgo(1),
        notes: 'Gym was busy',
      })
      vi.mocked(listWorkoutSets).mockResolvedValue([])
      render(<WorkoutScreen />)

      expect(await screen.findByLabelText(/notes/i)).toHaveValue('Gym was busy')
    })

    it('saves unsaved notes on finish and keeps a workout that only has notes', async () => {
      vi.mocked(updateWorkoutNotes).mockResolvedValue()
      render(<WorkoutScreen />)

      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
      fireEvent.change(await screen.findByLabelText(/notes/i), {
        target: { value: 'Skipped, knee sore' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }))

      expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
      expect(updateWorkoutNotes).toHaveBeenCalledWith('workout-1', 'Skipped, knee sore')
      expect(deleteWorkout).not.toHaveBeenCalled()
    })

    it('does not finish when notes fail to save', async () => {
      vi.mocked(updateWorkoutNotes).mockRejectedValue(new Error('offline'))
      render(<WorkoutScreen />)

      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
      fireEvent.change(await screen.findByLabelText(/notes/i), { target: { value: 'Felt strong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }))

      expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Finish workout' })).toBeInTheDocument()
    })
  })
})
