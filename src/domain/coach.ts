// Progress Coach input: the facts an AI coach is allowed to comment on.
//
// Everything numeric is calculated here, in tested code, before anything is sent
// to the model. LLMs are unreliable at arithmetic over raw data but good at
// explaining numbers they are handed, so the model only interprets these facts.
// Pure logic, no React or Supabase.

import { buildProgressPoints, type DatedSession, type ProgressPoint } from './progress'
import {
  getTopWeightWorkingSets,
  recommendNextSession,
  type ExerciseConfig,
  type LoggedSet,
  type Recommendation,
} from './progression'

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
 * count, and short enough to catch a stall within a 4-week report. The same
 * window is used for "recent" RPE.
 */
export const PLATEAU_SESSIONS = 3

// Notes are free text with no length limit, so cap what gets sent to keep the
// request small and the cost predictable.
export const MAX_COACH_NOTES = 20
export const MAX_NOTE_LENGTH = 300

/**
 * Mirrors the per-user cap in reserve_coach_report, only so the UI can show how
 * many reports are left. The database is what actually enforces it.
 */
export const COACH_DAILY_LIMIT_PER_USER = 2

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

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

// Field names are part of the prompt: the model reads them, so they say what they mean.
export type ExerciseFacts = {
  name: string
  repMin: number
  repMax: number
  sessionsInPeriod: number
  first: SessionSnapshot
  latest: SessionSnapshot
  estimatedOneRepMaxChangePercent: number
  /** Change spread over the weeks between first and latest session. Null with one session. */
  weeklyChangePercent: number | null
  weightIncreases: number
  sessionsAtCurrentWeight: number
  /** 0 means the latest session was the best of the period. */
  sessionsSinceBest: number
  isPlateau: boolean
  /** Reps the weakest top-weight set needs to reach repMax, which earns a weight increase. */
  repsShortOfIncrease: number
  /** Average RPE of top-weight working sets over recent sessions. Null if none was logged. */
  recentAverageRpe: number | null
  /** What the progression rules say to do next. The coach must not contradict it. */
  nextSession: Recommendation
}

export type SessionChange = {
  exercise: string
  changeFromPreviousSessionPercent: number
}

export type CoachNote = {
  date: string
  text: string
  /** How each lift trained that day compared with its previous session, so notes have context. */
  sessionChanges: SessionChange[]
}

export type CoachInput = {
  periodWeeks: number
  workoutsInPeriod: number
  workoutsPerWeek: number
  daysSinceLastWorkout: number | null
  longestGapDays: number | null
  /** Names ranked by weeklyChangePercent, best first. Only lifts with a trend are ranked. */
  exercisesFastestFirst: string[]
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

function percentChange(from: number, to: number): number {
  return roundToOneDecimal(((to - from) / from) * 100)
}

function isWithinPeriod(performedAt: string, periodStart: Date): boolean {
  return Date.parse(performedAt) >= periodStart.getTime()
}

/** The earliest moment a report covering the last `weeks` weeks includes. */
export function getPeriodStart(weeks: number, now: Date): Date {
  return new Date(now.getTime() - weeks * MS_PER_WEEK)
}

/**
 * How many more reports the user can request today. Every attempt counts,
 * including failed ones, matching the database. Days are UTC, like the database.
 *
 * @param attemptTimes created_at of the user's recent reports, in any order.
 */
export function countReportsLeftToday(attemptTimes: string[], now: Date): number {
  const startOfUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const usedToday = attemptTimes.filter((time) => Date.parse(time) >= startOfUtcDay).length
  return Math.max(0, COACH_DAILY_LIMIT_PER_USER - usedToday)
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

/**
 * Percent change per week between the first and latest point. Short spans count
 * as one week, so two sessions a few days apart don't look like a huge weekly rate.
 *
 * @param points Oldest first.
 */
export function weeklyChangePercent(points: ProgressPoint[]): number | null {
  if (points.length < 2) {
    return null
  }
  const first = points[0]
  const latest = points[points.length - 1]
  const weeks = Math.max(1, (Date.parse(latest.performedAt) - Date.parse(first.performedAt)) / MS_PER_WEEK)
  return roundToOneDecimal(percentChange(first.estimatedOneRepMax, latest.estimatedOneRepMax) / weeks)
}

/** @param points Oldest first. */
export function countWeightIncreases(points: ProgressPoint[]): number {
  let increases = 0
  for (let index = 1; index < points.length; index++) {
    if (points[index].topWeight > points[index - 1].topWeight) {
      increases++
    }
  }
  return increases
}

/** How many sessions in a row, ending with the latest, used the latest top weight. */
export function countSessionsAtCurrentWeight(points: ProgressPoint[]): number {
  const currentWeight = points[points.length - 1].topWeight
  let count = 0
  for (let index = points.length - 1; index >= 0 && points[index].topWeight === currentWeight; index--) {
    count++
  }
  return count
}

/** Sessions after the best estimated 1RM. Ties count as the later session, i.e. matching your best is not a stall. */
export function countSessionsSinceBest(points: ProgressPoint[]): number {
  let bestIndex = 0
  points.forEach((point, index) => {
    if (point.estimatedOneRepMax >= points[bestIndex].estimatedOneRepMax) {
      bestIndex = index
    }
  })
  return points.length - 1 - bestIndex
}

export function repsShortOfIncrease(latestSets: LoggedSet[], repMax: number): number {
  const topSets = getTopWeightWorkingSets(latestSets)
  const weakestReps = Math.min(...topSets.map((set) => set.reps))
  return Math.max(0, repMax - weakestReps)
}

/** @param recentSessions Newest first, each with at least one working set. */
export function averageTopSetRpe(recentSessions: DatedSession[]): number | null {
  const rpes = recentSessions
    .flatMap((session) => getTopWeightWorkingSets(session.sets))
    .map((set) => set.rpe)
    .filter((rpe) => rpe !== null)
  if (rpes.length === 0) {
    return null
  }
  return roundToOneDecimal(rpes.reduce((sum, rpe) => sum + rpe, 0) / rpes.length)
}

function toSnapshot(point: ProgressPoint): SessionSnapshot {
  return {
    date: toDate(point.performedAt),
    topWeight: point.topWeight,
    repsAtTopWeight: point.repsAtTopWeight,
    estimatedOneRepMax: point.estimatedOneRepMax,
  }
}

/**
 * @param points          The period's progress points, oldest first. Not empty.
 * @param sessionsInPeriod The period's sessions that had working sets, newest first.
 */
function buildExerciseFacts(
  exercise: CoachExercise,
  points: ProgressPoint[],
  sessionsInPeriod: DatedSession[],
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
    estimatedOneRepMaxChangePercent: percentChange(first.estimatedOneRepMax, latest.estimatedOneRepMax),
    weeklyChangePercent: weeklyChangePercent(points),
    weightIncreases: countWeightIncreases(points),
    sessionsAtCurrentWeight: countSessionsAtCurrentWeight(points),
    sessionsSinceBest: countSessionsSinceBest(points),
    isPlateau: isPlateau(points),
    repsShortOfIncrease: repsShortOfIncrease(sessionsInPeriod[0].sets, exercise.repMax),
    recentAverageRpe: averageTopSetRpe(sessionsInPeriod.slice(0, PLATEAU_SESSIONS)),
    // Uses full history, not just the period: the rules look at the last two sessions.
    nextSession: recommendNextSession(exercise, exercise.sessions),
  }
}

type ExerciseHistory = {
  name: string
  /** Every session's progress point, oldest first, including before the period. */
  allPoints: ProgressPoint[]
}

/** How each exercise trained in this workout compares with its own previous session. */
function findSessionChanges(performedAt: string, histories: ExerciseHistory[]): SessionChange[] {
  const workoutTime = Date.parse(performedAt)
  const changes: SessionChange[] = []
  for (const { name, allPoints } of histories) {
    const index = allPoints.findIndex((point) => Date.parse(point.performedAt) === workoutTime)
    if (index > 0) {
      const previous = allPoints[index - 1]
      changes.push({
        exercise: name,
        changeFromPreviousSessionPercent: percentChange(
          previous.estimatedOneRepMax,
          allPoints[index].estimatedOneRepMax,
        ),
      })
    }
  }
  return changes
}

function buildNotes(workouts: CoachWorkout[], histories: ExerciseHistory[]): CoachNote[] {
  const withNotes = workouts
    .map((workout) => ({ performedAt: workout.performedAt, text: workout.notes?.trim() ?? '' }))
    .filter((workout) => workout.text !== '')
    // Newest first, so the cap keeps the most recent notes.
    .sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt))
    .slice(0, MAX_COACH_NOTES)

  return withNotes.map((workout) => ({
    date: toDate(workout.performedAt),
    text: workout.text.slice(0, MAX_NOTE_LENGTH),
    sessionChanges: findSessionChanges(workout.performedAt, histories),
  }))
}

type ConsistencyFacts = Pick<
  CoachInput,
  'workoutsInPeriod' | 'workoutsPerWeek' | 'daysSinceLastWorkout' | 'longestGapDays'
>

function buildConsistencyFacts(workoutsInPeriod: CoachWorkout[], weeks: number, now: Date): ConsistencyFacts {
  const times = workoutsInPeriod.map((workout) => Date.parse(workout.performedAt)).sort((a, b) => a - b)
  let longestGapMs: number | null = null
  for (let index = 1; index < times.length; index++) {
    const gap = times[index] - times[index - 1]
    longestGapMs = longestGapMs === null ? gap : Math.max(longestGapMs, gap)
  }
  // Divide by the weeks actually trained in the period, from the first workout to now,
  // not the whole period: someone who started 6 weeks into a 12-week report trained
  // twice as often as "workouts / 12" suggests.
  const weeksTrained =
    times.length === 0 ? weeks : Math.min(weeks, Math.max(1, (now.getTime() - times[0]) / MS_PER_WEEK))
  return {
    workoutsInPeriod: times.length,
    workoutsPerWeek: roundToOneDecimal(times.length / weeksTrained),
    daysSinceLastWorkout: times.length === 0 ? null : Math.floor((now.getTime() - times[times.length - 1]) / MS_PER_DAY),
    longestGapDays: longestGapMs === null ? null : Math.round(longestGapMs / MS_PER_DAY),
  }
}

function rankFastestFirst(exercises: ExerciseFacts[]): string[] {
  return exercises
    .filter((facts) => facts.weeklyChangePercent !== null)
    .sort((a, b) => (b.weeklyChangePercent ?? 0) - (a.weeklyChangePercent ?? 0))
    .map((facts) => facts.name)
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
  const periodStart = getPeriodStart(request.weeks, now)
  const workoutsInPeriod = workouts.filter((workout) =>
    isWithinPeriod(workout.performedAt, periodStart),
  )

  const exerciseFacts: ExerciseFacts[] = []
  const untrainedExercises: string[] = []
  const histories: ExerciseHistory[] = []
  for (const exercise of exercises) {
    histories.push({ name: exercise.name, allPoints: buildProgressPoints(exercise.sessions) })

    const sessionsInPeriod = exercise.sessions.filter(
      (session) =>
        isWithinPeriod(session.performedAt, periodStart) &&
        getTopWeightWorkingSets(session.sets).length > 0,
    )
    if (sessionsInPeriod.length === 0) {
      untrainedExercises.push(exercise.name)
    } else {
      const points = buildProgressPoints(sessionsInPeriod)
      exerciseFacts.push(buildExerciseFacts(exercise, points, sessionsInPeriod))
    }
  }

  const input: CoachInput = {
    periodWeeks: request.weeks,
    ...buildConsistencyFacts(workoutsInPeriod, request.weeks, now),
    exercisesFastestFirst: rankFastestFirst(exerciseFacts),
    exercises: exerciseFacts,
    untrainedExercises,
  }
  if (request.topics.includes('notes')) {
    input.notes = buildNotes(workoutsInPeriod, histories)
  }
  return input
}
