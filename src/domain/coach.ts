// Progress Coach input: the facts an AI coach is allowed to comment on.
//
// Everything numeric is calculated here, in tested code, before anything is sent
// to the model. LLMs are unreliable at arithmetic over raw data but good at
// explaining numbers they are handed, so the model only interprets these facts.
// Pure logic, no React or Supabase.

import { buildProgressPoints, type DatedSession, type ProgressPoint } from './progress'
import { recommendNextSession, type ExerciseConfig, type Recommendation } from './progression'

export type CoachTopic = 'summary' | 'trends' | 'plateaus' | 'notes'

export const COACH_TOPICS: { id: CoachTopic; label: string }[] = [
  { id: 'summary', label: 'Overall summary' },
  { id: 'trends', label: 'Exercise trends' },
  { id: 'plateaus', label: 'Plateaus' },
  { id: 'notes', label: 'Notes and recovery' },
]

export const COACH_PERIOD_WEEKS = [4, 8, 12]

/**
 * A plateau means the last this-many sessions didn't beat the best estimated 1RM
 * from the sessions before them. Three is long enough that one bad day doesn't
 * count, and short enough to catch a stall within a 4-week report.
 */
export const PLATEAU_SESSIONS = 3

// Notes are free text with no length limit, so cap what gets sent to keep the
// request small and the cost predictable.
export const MAX_COACH_NOTES = 20
export const MAX_NOTE_LENGTH = 300

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export type CoachRequest = {
  topics: CoachTopic[]
  weeks: number
  exerciseIds: string[]
}

export type CoachExercise = ExerciseConfig & {
  name: string
  /** All logged sessions for this exercise, newest first (as the api returns them). */
  sessions: DatedSession[]
}

export type CoachWorkout = {
  performedAt: string
  notes: string | null
}

type SessionSnapshot = {
  date: string
  topWeight: number
  repsAtTopWeight: number
  estimatedOneRepMax: number
}

export type ExerciseFacts = {
  name: string
  repMin: number
  repMax: number
  sessionsInPeriod: number
  first: SessionSnapshot
  latest: SessionSnapshot
  estimatedOneRepMaxChange: number
  isPlateau: boolean
  /** What the progression rules say to do next. The coach must not contradict it. */
  nextSession: Recommendation
}

export type CoachNote = {
  date: string
  text: string
}

export type CoachInput = {
  periodWeeks: number
  workoutsInPeriod: number
  exercises: ExerciseFacts[]
  /** Selected exercises with no working sets in the period. */
  untrainedExercises: string[]
  /** Only present when the notes topic was chosen, so notes aren't sent otherwise. */
  notes?: CoachNote[]
}

/** Returns a user-facing error message, or null when the request is valid. */
export function validateCoachRequest(request: CoachRequest): string | null {
  if (request.topics.length === 0) {
    return 'Choose at least one topic for the coach.'
  }
  if (!COACH_PERIOD_WEEKS.includes(request.weeks)) {
    return 'Choose a time range.'
  }
  if (request.exerciseIds.length === 0) {
    return 'Choose at least one exercise.'
  }
  return null
}

/** The calendar date part of an ISO timestamp, e.g. "2026-10-01". Shorter for the model to read. */
function toDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10)
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function isWithinPeriod(performedAt: string, periodStart: Date): boolean {
  return Date.parse(performedAt) >= periodStart.getTime()
}

/** @param points Oldest first, as buildProgressPoints returns them. */
export function isPlateau(points: ProgressPoint[]): boolean {
  if (points.length <= PLATEAU_SESSIONS) {
    return false // not enough sessions to compare recent against earlier
  }
  const earlier = points.slice(0, -PLATEAU_SESSIONS)
  const recent = points.slice(-PLATEAU_SESSIONS)
  const bestEarlier = Math.max(...earlier.map((point) => point.estimatedOneRepMax))
  const bestRecent = Math.max(...recent.map((point) => point.estimatedOneRepMax))
  return bestRecent <= bestEarlier
}

function toSnapshot(point: ProgressPoint): SessionSnapshot {
  return {
    date: toDate(point.performedAt),
    topWeight: point.topWeight,
    repsAtTopWeight: point.repsAtTopWeight,
    estimatedOneRepMax: point.estimatedOneRepMax,
  }
}

function buildExerciseFacts(
  exercise: CoachExercise,
  points: ProgressPoint[],
): ExerciseFacts {
  const first = points[0]
  const latest = points[points.length - 1]
  return {
    name: exercise.name,
    repMin: exercise.repMin,
    repMax: exercise.repMax,
    sessionsInPeriod: points.length,
    first: toSnapshot(first),
    latest: toSnapshot(latest),
    estimatedOneRepMaxChange: roundToOneDecimal(latest.estimatedOneRepMax - first.estimatedOneRepMax),
    isPlateau: isPlateau(points),
    // Uses full history, not just the period: the rules look at the last two sessions.
    nextSession: recommendNextSession(exercise, exercise.sessions),
  }
}

function buildNotes(workouts: CoachWorkout[]): CoachNote[] {
  const notes: CoachNote[] = []
  for (const workout of workouts) {
    const text = workout.notes?.trim() ?? ''
    if (text !== '') {
      notes.push({ date: toDate(workout.performedAt), text: text.slice(0, MAX_NOTE_LENGTH) })
    }
  }
  // Newest first, so the cap keeps the most recent notes.
  notes.sort((a, b) => b.date.localeCompare(a.date))
  return notes.slice(0, MAX_COACH_NOTES)
}

/**
 * Turns raw history into the compact facts sent to the coach.
 *
 * @param exercises The exercises the user selected, each with its full history.
 * @param workouts  The user's workouts (any period; filtered here), for counts and notes.
 */
export function buildCoachInput(
  request: CoachRequest,
  exercises: CoachExercise[],
  workouts: CoachWorkout[],
  now: Date,
): CoachInput {
  const periodStart = new Date(now.getTime() - request.weeks * MS_PER_WEEK)
  const workoutsInPeriod = workouts.filter((workout) =>
    isWithinPeriod(workout.performedAt, periodStart),
  )

  const exerciseFacts: ExerciseFacts[] = []
  const untrainedExercises: string[] = []
  for (const exercise of exercises) {
    const sessionsInPeriod = exercise.sessions.filter((session) =>
      isWithinPeriod(session.performedAt, periodStart),
    )
    const points = buildProgressPoints(sessionsInPeriod)
    if (points.length === 0) {
      untrainedExercises.push(exercise.name)
    } else {
      exerciseFacts.push(buildExerciseFacts(exercise, points))
    }
  }

  const input: CoachInput = {
    periodWeeks: request.weeks,
    workoutsInPeriod: workoutsInPeriod.length,
    exercises: exerciseFacts,
    untrainedExercises,
  }
  if (request.topics.includes('notes')) {
    input.notes = buildNotes(workoutsInPeriod)
  }
  return input
}
