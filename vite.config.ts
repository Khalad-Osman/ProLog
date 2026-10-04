import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // jsdom gives component tests a browser-like DOM; pure domain tests don't need it but it's cheap.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
