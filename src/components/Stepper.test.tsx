import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

/** Holds the value like a real form does, so typed changes show up. */
function ControlledStepper(props: { initial: number; allowDecimals?: boolean; min?: number; max?: number }) {
  const [value, setValue] = useState(props.initial)
  return (
    <Stepper
      label="Weight"
      value={value}
      onChange={setValue}
      step={5}
      min={props.min}
      max={props.max}
      allowDecimals={props.allowDecimals}
    />
  )
}

/** Taps the number, types into it, then leaves the field (as tapping elsewhere would). */
function typeValue(text: string) {
  const input = screen.getByLabelText('Weight')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: text } })
  fireEvent.blur(input)
}

describe('Stepper typing', () => {
  it('accepts a typed value, for jumps too big to tap', () => {
    render(<ControlledStepper initial={205} allowDecimals />)

    typeValue('315')

    expect(screen.getByLabelText('Weight')).toHaveValue('315')
  })

  it('accepts decimals, with a comma as the decimal point', () => {
    render(<ControlledStepper initial={100} allowDecimals />)

    typeValue('102,5')

    expect(screen.getByLabelText('Weight')).toHaveValue('102.5')
  })

  it('rounds to whole numbers when decimals are not allowed', () => {
    render(<ControlledStepper initial={8} />)

    typeValue('8.6')

    expect(screen.getByLabelText('Weight')).toHaveValue('9')
  })

  it('goes back to the previous value for empty or invalid input', () => {
    render(<ControlledStepper initial={205} allowDecimals />)

    typeValue('')
    expect(screen.getByLabelText('Weight')).toHaveValue('205')

    typeValue('abc')
    expect(screen.getByLabelText('Weight')).toHaveValue('205')
  })

  it('keeps a typed value within the limits', () => {
    render(<ControlledStepper initial={205} min={0} max={9999} allowDecimals />)

    typeValue('20500')
    expect(screen.getByLabelText('Weight')).toHaveValue('9999')

    typeValue('-10')
    expect(screen.getByLabelText('Weight')).toHaveValue('0')
  })

  it('applies a typed value when Enter is pressed', () => {
    render(<ControlledStepper initial={205} allowDecimals />)
    const input = screen.getByLabelText('Weight')
    input.focus()
    fireEvent.change(input, { target: { value: '225' } })

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input).toHaveValue('225')
    expect(input).not.toHaveFocus()
  })

  it('does not apply half-typed text until editing ends', () => {
    const onChange = vi.fn()
    render(<Stepper label="Weight" value={205} onChange={onChange} allowDecimals />)
    const input = screen.getByLabelText('Weight')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '3' } })

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('3')
  })
})

describe('Stepper', () => {
  it('shows the current value', () => {
    render(<Stepper label="Reps" value={8} onChange={() => {}} />)

    expect(screen.getByLabelText('Reps')).toHaveValue('8')
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
