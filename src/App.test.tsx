import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

// Smoke test: proves Vitest, jsdom and React Testing Library are wired up correctly.
describe('App', () => {
  it('renders the app name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'ProLog' })).toBeInTheDocument()
  })
})
