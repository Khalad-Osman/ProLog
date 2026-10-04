import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no ResizeObserver, which Recharts' ResponsiveContainer needs. Charts
// have no real size in jsdom anyway, so a do-nothing stand-in is enough.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

// Vitest globals are off, so React Testing Library can't register its own auto-cleanup.
afterEach(() => {
  cleanup()
})
