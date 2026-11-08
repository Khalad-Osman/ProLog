import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCoachReports, requestCoachReport, type CoachReport } from '../../api/coach'
import type { Exercise } from '../../api/exercises'
import { CoachSection } from './CoachSection'

vi.mock('../../api/coach')

const bench: Exercise = { id: 'ex-bench', name: 'Bench press', repMin: 8, repMax: 12, increment: 2.5 }
const squat: Exercise = { id: 'ex-squat', name: 'Squat', repMin: 5, repMax: 8, increment: 5 }

const NOW = new Date('2026-11-05T15:00:00Z')

function report(overrides: Partial<CoachReport> = {}): CoachReport {
  return {
    id: 'report-1',
    createdAt: '2026-11-01T10:00:00Z',
    status: 'complete',
    periodWeeks: 4,
    sections: [{ title: 'Overall summary', body: 'Steady month.' }],
    ...overrides,
  }
}

function renderCoach() {
  return render(<CoachSection exercises={[bench, squat]} />)
}

describe('CoachSection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Only Date is faked, so promises and React still run normally.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.mocked(listCoachReports).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the latest report and keeps older ones tucked away', async () => {
    vi.mocked(listCoachReports).mockResolvedValue([
      report({ id: 'new', sections: [{ title: 'Plateaus', body: 'Squat has stalled.' }] }),
      report({ id: 'failed', status: 'failed', sections: [] }),
      report({ id: 'old' }),
    ])
    renderCoach()

    expect(await screen.findByText('Squat has stalled.')).toBeInTheDocument()
    expect(screen.getByText('Previous reports (1)')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 reports left today')).toBeInTheDocument()
  })

  it("counts today's attempts, including failed ones", async () => {
    vi.mocked(listCoachReports).mockResolvedValue([
      report({ id: 'today', status: 'failed', sections: [], createdAt: '2026-11-05T09:00:00Z' }),
    ])
    renderCoach()

    expect(await screen.findByText('1 of 2 reports left today')).toBeInTheDocument()
  })

  it('disables asking once no reports are left', async () => {
    vi.mocked(listCoachReports).mockResolvedValue([
      report({ id: 'a', createdAt: '2026-11-05T08:00:00Z' }),
      report({ id: 'b', createdAt: '2026-11-05T09:00:00Z' }),
    ])
    renderCoach()

    expect(await screen.findByRole('button', { name: 'No reports left today' })).toBeDisabled()
  })

  it('sends the chosen topics, range and exercises, then shows the new report', async () => {
    vi.mocked(requestCoachReport).mockResolvedValue(
      report({ id: 'fresh', createdAt: NOW.toISOString(), sections: [{ title: 'Plateaus', body: 'All moving.' }] }),
    )
    renderCoach()

    fireEvent.click(await screen.findByRole('button', { name: 'Ask the coach' }))
    fireEvent.click(screen.getByLabelText('Exercise trends')) // on by default, turn it off
    fireEvent.click(screen.getByLabelText('Plateaus'))
    fireEvent.click(screen.getByRole('button', { name: '8 weeks' }))
    fireEvent.click(screen.getByLabelText('Squat'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    expect(await screen.findByText('All moving.')).toBeInTheDocument()
    expect(requestCoachReport).toHaveBeenCalledWith(
      { topics: ['summary', 'plateaus'], weeks: 8, exerciseIds: [bench.id] },
      [bench, squat],
    )
    expect(screen.getByText('1 of 2 reports left today')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument()
  })

  it('will not generate without a topic', async () => {
    renderCoach()

    fireEvent.click(await screen.findByRole('button', { name: 'Ask the coach' }))
    fireEvent.click(screen.getByLabelText('Overall summary'))
    fireEvent.click(screen.getByLabelText('Exercise trends'))

    expect(screen.getByText(/at least one topic/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeDisabled()
  })

  it('shows why a report failed and refreshes the count', async () => {
    vi.mocked(requestCoachReport).mockRejectedValue(new Error("You've used today's 2 coach reports."))
    renderCoach()

    fireEvent.click(await screen.findByRole('button', { name: 'Ask the coach' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("You've used today's 2 coach reports.")
    // Once on first load, once more after the failure.
    expect(listCoachReports).toHaveBeenCalledTimes(2)
  })

  it('shows an error loading reports and retries', async () => {
    vi.mocked(listCoachReports)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce([report()])
    renderCoach()

    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    const latest = await screen.findByRole('article')
    expect(within(latest).getByText('Steady month.')).toBeInTheDocument()
  })
})
