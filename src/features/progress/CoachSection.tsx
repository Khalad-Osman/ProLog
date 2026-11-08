import { useEffect, useState } from 'react'
import { listCoachReports, requestCoachReport, type CoachReport } from '../../api/coach'
import type { Exercise } from '../../api/exercises'
import { ErrorWithRetry } from '../../components/ErrorWithRetry'
import { COACH_DAILY_LIMIT_PER_USER, countReportsLeftToday, type CoachRequest } from '../../domain/coach'
import { CoachForm } from './CoachForm'

type ReportsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; reports: CoachReport[]; reportsLeft: number }

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback
}

function formatReportDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function CoachSection({ exercises }: { exercises: Exercise[] }) {
  const [reportsState, setReportsState] = useState<ReportsState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    listCoachReports()
      .then((reports) => {
        if (isCurrent) {
          const attemptTimes = reports.map((report) => report.createdAt)
          setReportsState({
            status: 'ready',
            reports,
            reportsLeft: countReportsLeftToday(attemptTimes, new Date()),
          })
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setReportsState({ status: 'error', message: errorMessage(caught, 'Could not load coach reports.') })
        }
      })
    return () => {
      isCurrent = false
    }
  }, [loadAttempt])

  async function handleGenerate(request: CoachRequest) {
    setRequestError(null)
    setIsGenerating(true)
    try {
      const report = await requestCoachReport(request, exercises)
      setReportsState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              reports: [report, ...current.reports],
              reportsLeft: Math.max(0, current.reportsLeft - 1),
            }
          : current,
      )
      setIsFormOpen(false)
    } catch (caught) {
      setRequestError(errorMessage(caught, 'The coach could not write a report.'))
      // Some failures still use up an attempt (see the coach_reports migration), and
      // only the database knows which. Reload quietly so "reports left" stays accurate.
      setLoadAttempt((attempt) => attempt + 1)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section aria-labelledby="coach-heading" className="space-y-4 rounded-xl border border-slate-700 p-4">
      <div>
        <h3 id="coach-heading" className="text-lg font-semibold">Progress Coach</h3>
        <p className="text-sm text-slate-400">
          An AI-written summary of your logged training. Not medical advice.
        </p>
      </div>

      {reportsState.status === 'loading' && (
        <p role="status" className="text-slate-400">Loading coach reports…</p>
      )}

      {reportsState.status === 'error' && (
        <ErrorWithRetry
          message={reportsState.message}
          onRetry={() => {
            setReportsState({ status: 'loading' })
            setLoadAttempt((attempt) => attempt + 1)
          }}
        />
      )}

      {reportsState.status === 'ready' && (
        <CoachContent
          exercises={exercises}
          reports={reportsState.reports}
          reportsLeft={reportsState.reportsLeft}
          isFormOpen={isFormOpen}
          isGenerating={isGenerating}
          requestError={requestError}
          onOpenForm={() => {
            setRequestError(null)
            setIsFormOpen(true)
          }}
          onCloseForm={() => setIsFormOpen(false)}
          onGenerate={handleGenerate}
        />
      )}
    </section>
  )
}

type CoachContentProps = {
  exercises: Exercise[]
  reports: CoachReport[]
  reportsLeft: number
  isFormOpen: boolean
  isGenerating: boolean
  requestError: string | null
  onOpenForm: () => void
  onCloseForm: () => void
  onGenerate: (request: CoachRequest) => void
}

function CoachContent({
  exercises,
  reports,
  reportsLeft,
  isFormOpen,
  isGenerating,
  requestError,
  onOpenForm,
  onCloseForm,
  onGenerate,
}: CoachContentProps) {
  // Failed and unfinished attempts count toward the limit but have nothing to show.
  const [latest, ...previous] = reports.filter((report) => report.status === 'complete')

  return (
    <>
      <p className="text-sm text-slate-300">
        {reportsLeft} of {COACH_DAILY_LIMIT_PER_USER} reports left today
      </p>

      {isFormOpen ? (
        <CoachForm
          exercises={exercises}
          isGenerating={isGenerating}
          onSubmit={onGenerate}
          onCancel={onCloseForm}
        />
      ) : (
        <button
          type="button"
          onClick={onOpenForm}
          disabled={reportsLeft === 0}
          className="w-full rounded-lg border border-emerald-700 py-4 text-lg disabled:opacity-60"
        >
          {reportsLeft === 0 ? 'No reports left today' : 'Ask the coach'}
        </button>
      )}

      {isGenerating && (
        <p role="status" className="text-slate-400">
          Writing your report. This can take up to a minute.
        </p>
      )}

      {requestError !== null && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {requestError}
        </p>
      )}

      {latest !== undefined && <ReportCard report={latest} />}

      {previous.length > 0 && (
        <details className="rounded-lg bg-slate-900 px-4 py-3">
          <summary className="cursor-pointer py-1">Previous reports ({previous.length})</summary>
          <div className="mt-3 space-y-4">
            {previous.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        </details>
      )}
    </>
  )
}

function ReportCard({ report }: { report: CoachReport }) {
  return (
    <article aria-label={`Coach report from ${formatReportDate(report.createdAt)}`} className="space-y-3">
      <p className="text-sm text-slate-400">
        {formatReportDate(report.createdAt)} · last {report.periodWeeks} weeks
      </p>
      {report.sections.map((section) => (
        <div key={section.title}>
          <h4 className="font-semibold">{section.title}</h4>
          {/* Plain text from the model, rendered as text: React escapes it, so nothing in it can run as HTML. */}
          <p className="mt-1 whitespace-pre-line text-slate-300">{section.body}</p>
        </div>
      ))}
    </article>
  )
}
