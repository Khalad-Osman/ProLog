import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

describe('Stepper', () => {
  it('shows the current value', () => {
    render(<Stepper label="Reps" value={8} onChange={() => {}} />)

    expect(screen.getByLabelText('Reps')).toHaveTextContent('8')
  })

  it('steps up and down by the given step', () => {
    const onChange = vi.fn()
    render(<Stepper label="Weight" value={100} step={2.5} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Increase Weight' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Weight' }))

    expect(onChange).toHaveBeenNthCalledWith(1, 102.5)
    expect(onChange).toHaveBeenNthCalledWith(2, 97.5)
  })

  it('avoids floating point noise', () => {
    const onChange = vi.fn()
    render(<Stepper label="Weight" value={0.2} step={0.1} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Increase Weight' }))

    expect(onChange).toHaveBeenCalledWith(0.3)
  })

  it('disables the buttons at the limits', () => {
    const { rerender } = render(<Stepper label="Reps" value={1} min={1} max={5} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Decrease Reps' })).toBeDisabled()

    rerender(<Stepper label="Reps" value={5} min={1} max={5} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Increase Reps' })).toBeDisabled()
  })

  it('clamps a step that would overshoot the limit', () => {
    const onChange = vi.fn()
    render(<Stepper label="Weight" value={1} step={2.5} min={0} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Decrease Weight' }))

    expect(onChange).toHaveBeenCalledWith(0)
  })
})
