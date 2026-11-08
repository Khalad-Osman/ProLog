import { FunctionsHttpError } from '@supabase/supabase-js'
import { buildCoachInput, getPeriodStart, type CoachRequest } from '../domain/coach'
import { supabase } from '../lib/supabase'
import type { Tables } from '../types/database'
import type { Exercise } from './exercises'
import { getExerciseProgress, listWorkoutsSince } from './workouts'

export type ReportSection = {
  title: string
  body: string
}

export type CoachReport = {
  id: string
  createdAt: string
  status: 'pending' | 'complete' | 'failed'
  periodWeeks: number
  /** Empty unless the report is complete. */
  sections: ReportSection[]
}

// Enough to show a few past reports. Today's attempts (at most 2) are always the
// newest rows, so they are always included for the "reports left" count.
const RECENT_REPORT_LIMIT = 10

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Sections are stored as jsonb (typed only as Json) and also arrive from the Edge
// Function as plain JSON, so check the shape rather than trusting it.
function toSections(value: unknown): ReportSection[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(
    (section): section is ReportSection =>
      isObject(section) && typeof section.title === 'string' && typeof section.body === 'string',
  )
}

function toStatus(value: string): CoachReport['status'] {
  return value === 'complete' || value === 'failed' ? value : 'pending'
}

function toCoachReport(row: Tables<'coach_reports'>): CoachReport {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: toStatus(row.status),
    periodWeeks: row.period_weeks,
    sections: toSections(row.sections),
  }
}

/** The user's most recent report attempts, newest first, including failed ones. */
export async function listCoachReports(): Promise<CoachReport[]> {
  const { data, error } = await supabase
    .from('coach_reports')
    .select()
    .order('created_at', { ascending: false })
    .limit(RECENT_REPORT_LIMIT)
  if (error) {
    throw new Error(error.message)
  }
  return data.map(toCoachReport)
}

/** The Edge Function explains every failure in { error }, e.g. a daily limit reached. */
async function readFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await error.context.json()
      if (isObject(body) && typeof body.error === 'string') {
        return body.error
      }
    } catch {
      // Not JSON (e.g. a gateway error page); fall through to the generic message.
    }
  }
  return 'Could not reach the coach. Check your connection and try again.'
}

/**
 * Gathers the selected exercises' history, turns it into facts in domain/, and
 * asks the coach Edge Function for a report.
 *
 * @param exercises All of the user's exercises; only those in the request are used.
 */
export async function requestCoachReport(
  request: CoachRequest,
  exercises: Exercise[],
  now: Date = new Date(),
): Promise<CoachReport> {
  const selected = exercises.filter((exercise) => request.exerciseIds.includes(exercise.id))
  // Full history per exercise: the next-session recommendation needs sessions
  // from before the period too (see buildCoachInput).
  const [sessionsPerExercise, workouts] = await Promise.all([
    Promise.all(selected.map((exercise) => getExerciseProgress(exercise.id))),
    listWorkoutsSince(getPeriodStart(request.weeks, now)),
  ])
  const coachExercises = selected.map((exercise, index) => ({
    ...exercise,
    sessions: sessionsPerExercise[index],
  }))
  const input = buildCoachInput(request, coachExercises, workouts, now)

  const { data, error } = await supabase.functions.invoke('coach', {
    body: { topics: request.topics, weeks: request.weeks, input },
  })
  if (error) {
    throw new Error(await readFunctionError(error))
  }

  return toNewReport(data, request.weeks)
}

function toNewReport(reply: unknown, periodWeeks: number): CoachReport {
  if (!isObject(reply) || typeof reply.id !== 'string' || typeof reply.createdAt !== 'string') {
    throw new Error('The coach sent back a report in an unexpected format.')
  }
  const sections = toSections(reply.sections)
  if (sections.length === 0) {
    throw new Error('The coach sent back an empty report.')
  }
  return { id: reply.id, createdAt: reply.createdAt, status: 'complete', periodWeeks, sections }
}
