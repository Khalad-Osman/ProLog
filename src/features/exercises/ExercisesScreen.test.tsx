import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createExercise,
  deleteExercise,
  listExercises,
  updateExercise,
  type Exercise,
} from '../../api/exercises'
import { ExercisesScreen } from './ExercisesScreen'

vi.mock('../../api/exercises')

const bench: Exercise = { id: 'ex-1', name: 'Bench press', repMin: 8, repMax: 12, increment: 2.5 }
const squat: Exercise = { id: 'ex-2', name: 'Squat', repMin: 5, repMax: 8, increment: 5 }

describe('ExercisesScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading state, then the exercises', async () => {
    vi.mocked(listExercises).mockResolvedValue([bench, squat])
    render(<ExercisesScreen />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(await screen.findByText('Bench press')).toBeInTheDocument()
    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('8–12 reps · +2.5')).toBeInTheDocument()
  })

  it('shows an empty state when there are no exercises', async () => {
    vi.mocked(listExercises).mockResolvedValue([])
    render(<ExercisesScreen />)

    expect(await screen.findByText(/no exercises yet/i)).toBeInTheDocument()
  })

  it('shows an error and retries loading', async () => {
    vi.mocked(listExercises)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([bench])
    render(<ExercisesScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Bench press')).toBeInTheDocument()
  })

  it('adds a new exercise with the chosen settings', async () => {
    vi.mocked(listExercises).mockResolvedValue([])
    vi.mocked(createExercise).mockResolvedValue({ ...squat, repMax: 9 })
    render(<ExercisesScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add exercise' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Squat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Min reps' })) // 8 -> 7
    fireEvent.click(screen.getByRole('button', { name: 'Increase Max reps' })) // 12 -> 13
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(createExercise).toHaveBeenCalledWith({
        name: 'Squat',
        repMin: 7,
        repMax: 13,
        increment: 5,
      })
    })
    // Back on the list with the saved exercise shown.
    expect(await screen.findByText('5–9 reps · +5')).toBeInTheDocument()
  })

  it('shows a validation error instead of saving an unnamed exercise', async () => {
    vi.mocked(listExercises).mockResolvedValue([])
    render(<ExercisesScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i)
    expect(createExercise).not.toHaveBeenCalled()
  })

  it('shows a save error, such as a duplicate name, and stays on the form', async () => {
    vi.mocked(listExercises).mockResolvedValue([bench])
    vi.mocked(createExercise).mockRejectedValue(
      new Error('You already have an exercise called "Bench press".'),
    )
    render(<ExercisesScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add exercise' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bench press' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already have an exercise')
    expect(screen.getByLabelText('Name')).toHaveValue('Bench press')
  })

  it('edits an existing exercise', async () => {
    vi.mocked(listExercises).mockResolvedValue([bench])
    vi.mocked(updateExercise).mockResolvedValue({ ...bench, name: 'Incline bench' })
    render(<ExercisesScreen />)

    fireEvent.click(await screen.findByText('Bench press'))
    expect(screen.getByLabelText('Name')).toHaveValue('Bench press')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Incline bench' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateExercise).toHaveBeenCalledWith('ex-1', {
        name: 'Incline bench',
        repMin: 8,
        repMax: 12,
        increment: 2.5,
      })
    })
    expect(await screen.findByText('Incline bench')).toBeInTheDocument()
  })

  it('deletes an exercise after confirmation', async () => {
    vi.mocked(listExercises).mockResolvedValue([bench, squat])
    vi.mocked(deleteExercise).mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ExercisesScreen />)

    fireEvent.click(await screen.findByText('Bench press'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete exercise' }))

    await waitFor(() => {
      expect(deleteExercise).toHaveBeenCalledWith('ex-1')
    })
    expect(await screen.findByText('Squat')).toBeInTheDocument()
    expect(screen.queryByText('Bench press')).not.toBeInTheDocument()
  })

  it('does not delete when the confirmation is cancelled', async () => {
    vi.mocked(listExercises).mockResolvedValue([bench])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ExercisesScreen />)

    fireEvent.click(await screen.findByText('Bench press'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete exercise' }))

    expect(deleteExercise).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
