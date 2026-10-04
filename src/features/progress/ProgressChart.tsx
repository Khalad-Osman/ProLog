import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProgressPoint } from '../../domain/progress'

// Series colors: slots 1 and 2 of a colorblind-validated palette, checked against
// the slate-900 card (CVD ΔE 26.8, both ≥ 3:1 contrast). The 1RM line is also
// dashed, so the two lines never rely on color alone.
export const SERIES = {
  topWeight: { label: 'Top weight', color: '#3987e5' },
  estimatedOneRepMax: { label: 'Est. 1RM', color: '#d95926', dash: '6 4' },
} as const

// Chart chrome stays recessive: Tailwind slate tokens as hex for SVG attributes.
const SURFACE = '#0f172a' // slate-900, matches the card behind the chart
const GRID = '#1e293b' // slate-800
const AXIS_TEXT = '#94a3b8' // slate-400
const TOOLTIP_TEXT = '#e2e8f0' // slate-200

export function formatShortDate(performedAt: string): string {
  return new Date(performedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const data = points.map((point) => ({
    date: formatShortDate(point.performedAt),
    topWeight: point.topWeight,
    estimatedOneRepMax: point.estimatedOneRepMax,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          {/* One y-axis: both lines are the same unit (weight), so they share a scale. */}
          <YAxis
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ backgroundColor: SURFACE, border: `1px solid ${GRID}`, borderRadius: 8 }}
            labelStyle={{ color: TOOLTIP_TEXT, fontWeight: 600 }}
            itemStyle={{ color: TOOLTIP_TEXT }}
            cursor={{ stroke: AXIS_TEXT, strokeDasharray: '3 3' }}
          />
          <Line
            type="monotone"
            dataKey="topWeight"
            name={SERIES.topWeight.label}
            stroke={SERIES.topWeight.color}
            strokeWidth={2}
            // A surface-colored ring keeps overlapping dots distinct.
            dot={{ r: 4, fill: SERIES.topWeight.color, stroke: SURFACE, strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="estimatedOneRepMax"
            name={SERIES.estimatedOneRepMax.label}
            stroke={SERIES.estimatedOneRepMax.color}
            strokeWidth={2}
            strokeDasharray={SERIES.estimatedOneRepMax.dash}
            dot={{ r: 4, fill: SERIES.estimatedOneRepMax.color, stroke: SURFACE, strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
