import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

function readRequiredEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name]
  // Fail loudly at startup: a missing key otherwise surfaces later as a confusing network error.
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in your Supabase project values, then restart the dev server.`,
    )
  }
  return value
}

const supabaseUrl = readRequiredEnv('VITE_SUPABASE_URL')
const supabaseAnonKey = readRequiredEnv('VITE_SUPABASE_ANON_KEY')

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
