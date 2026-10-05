import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signIn, signUp, startDemo } from '../../api/auth'
import { AuthScreen } from './AuthScreen'

vi.mock('../../api/auth')

function fillInForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

describe('AuthScreen', () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset()
    vi.mocked(signUp).mockReset()
    vi.mocked(startDemo).mockReset()
  })

  it('signs in with the entered email and password', async () => {
    vi.mocked(signIn).mockResolvedValue()
    render(<AuthScreen />)

    fillInForm('lifter@example.com', 'secret123')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('lifter@example.com', 'secret123')
    })
  })

  it('shows the error when sign in fails', async () => {
    vi.mocked(signIn).mockRejectedValue(new Error('Invalid login credentials'))
    render(<AuthScreen />)

    fillInForm('lifter@example.com', 'wrong-password')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
  })

  it('creates an account in sign-up mode', async () => {
    vi.mocked(signUp).mockResolvedValue({ signedIn: true })
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: /create an account/i }))
    fillInForm('new@example.com', 'secret123')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith('new@example.com', 'secret123')
    })
    expect(signIn).not.toHaveBeenCalled()
  })

  it('asks the user to check their email when confirmation is required', async () => {
    vi.mocked(signUp).mockResolvedValue({ signedIn: false })
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: /create an account/i }))
    fillInForm('new@example.com', 'secret123')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i)
  })

  it('rejects a short password before calling Supabase', async () => {
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: /create an account/i }))
    fillInForm('new@example.com', '123')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 6 characters/i)
    expect(signUp).not.toHaveBeenCalled()
  })

  it('starts the demo without asking for an email', async () => {
    vi.mocked(startDemo).mockResolvedValue()
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))

    await waitFor(() => {
      expect(startDemo).toHaveBeenCalled()
    })
    expect(signIn).not.toHaveBeenCalled()
  })

  it('shows an error when the demo cannot start', async () => {
    vi.mocked(startDemo).mockRejectedValue(new Error('Anonymous sign-ins are disabled'))
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Anonymous sign-ins are disabled')
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled()
  })
})
