// Progress Coach Edge Function.
//
// Runs on Supabase's servers, not in the browser, because it holds two secrets:
// the OpenAI API key and the service-role key. Neither is ever sent to the client.
//
// Flow: check config → identify the user → validate the request → reserve a
// report (enforces the daily caps) → ask OpenAI → save and return the report.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import {
  buildReportSchema,
  buildUserMessage,
  MAX_OUTPUT_TOKENS,
  parseReport,
  readMessageContent,
  SYSTEM_PROMPT,
  validateRequestBody,
  type CoachRequestBody,
  type ReportSection,
} from './report.ts'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_TIMEOUT_MS = 60_000

// The app is served from a different origin (Vercel), so the browser needs these
// to be allowed to call this function. Access is still controlled by the user's token.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Error codes raised by reserve_coach_report (see the coach_reports migration).
const LIMIT_MESSAGES: Record<string, string> = {
  coach_user_limit_reached: "You've used today's 2 coach reports. Try again tomorrow.",
  coach_global_limit_reached: 'The coach has reached its daily limit for everyone. Try again tomorrow.',
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function readLimitMessage(errorMessage: string): string | null {
  for (const [code, message] of Object.entries(LIMIT_MESSAGES)) {
    if (errorMessage.includes(code)) {
      return message
    }
  }
  return null
}

async function askOpenAi(
  apiKey: string,
  model: string,
  request: CoachRequestBody,
): Promise<ReportSection[]> {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(request.topics, request.input) },
      ],
      // Structured outputs: the reply must match this schema, so it can be parsed reliably.
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'coach_report', strict: true, schema: buildReportSchema(request.topics) },
      },
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  })
  if (!response.ok) {
    // The body can explain the problem (bad key, unknown model), so log it for debugging.
    throw new Error(`OpenAI responded ${response.status}: ${await response.text()}`)
  }

  const content = readMessageContent(await response.json())
  const sections = content === null ? null : parseReport(content, request.topics)
  if (sections === null) {
    throw new Error('OpenAI reply was missing or did not match the report format.')
  }
  return sections
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Use POST.' })
  }

  // Checked first, so a missing secret never uses up one of the user's reports.
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  const model = Deno.env.get('OPENAI_MODEL')
  if (!openAiKey || !model) {
    console.error('OPENAI_API_KEY or OPENAI_MODEL secret is not set.')
    return jsonResponse(500, { error: "The coach isn't set up yet." })
  }

  // Provided automatically to every Edge Function by Supabase.
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

  // The user id comes from their verified token, never from the request body,
  // so nobody can spend someone else's allowance.
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) {
    return jsonResponse(401, { error: 'Sign in to use the coach.' })
  }
  const userId = userData.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'The request must be JSON.' })
  }
  const validated = validateRequestBody(body)
  if (!validated.ok) {
    return jsonResponse(400, { error: validated.error })
  }
  const coachRequest = validated.value

  const { data: reportId, error: reserveError } = await admin.rpc('reserve_coach_report', {
    p_user_id: userId,
    p_topics: coachRequest.topics,
    p_period_weeks: coachRequest.weeks,
  })
  if (reserveError) {
    const limitMessage = readLimitMessage(reserveError.message)
    if (limitMessage !== null) {
      return jsonResponse(429, { error: limitMessage })
    }
    console.error('Could not reserve a coach report:', reserveError.message)
    return jsonResponse(500, { error: 'Could not start a report. Please try again.' })
  }
  if (typeof reportId !== 'string') {
    console.error('reserve_coach_report returned no id.')
    return jsonResponse(500, { error: 'Could not start a report. Please try again.' })
  }

  let sections: ReportSection[]
  try {
    sections = await askOpenAi(openAiKey, model, coachRequest)
  } catch (caught) {
    console.error('Coach report failed:', caught instanceof Error ? caught.message : caught)
    await admin.from('coach_reports').update({ status: 'failed' }).eq('id', reportId)
    return jsonResponse(502, {
      error: "The coach couldn't write a report this time. This attempt still counts toward today's limit.",
    })
  }

  const { data: saved, error: saveError } = await admin
    .from('coach_reports')
    .update({ status: 'complete', sections })
    .eq('id', reportId)
    .select('created_at')
    .single()
  if (saveError || typeof saved?.created_at !== 'string') {
    // The report exists in memory, so still return it; it just won't be in the saved list.
    console.error('Could not save coach report:', saveError?.message)
    return jsonResponse(200, { id: reportId, createdAt: new Date().toISOString(), sections })
  }

  return jsonResponse(200, { id: reportId, createdAt: saved.created_at, sections })
})
