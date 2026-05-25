import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TimeseriesBucket } from '../types'
import { Card, SectionHeader, Skeleton } from './ui'

interface TooltipPayload {
  name: string
  value: number
  color: string
  dataKey: string
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 shadow-card backdrop-blur">
      <div className="mb-1 text-xs font-semibold text-slate-300">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-slate-400">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-white">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ThreatTimeline({
  timeseries,
}: {
  timeseries: TimeseriesBucket[] | null
}) {
  return (
    <section id="timeline">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Last 24 hours"
          title="Threat Timeline"
          subtitle="Hourly volume of flagged attacks versus normal traffic."
          right={
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                Attacks
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
                Normal
              </span>
            </div>
          }
        />

        {!timeseries ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={timeseries}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="grad-normal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="grad-attacks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  interval={3}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={40}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: 'rgba(168,85,247,0.3)', strokeWidth: 1 }}
                />
                {/* Normal drawn first (behind), attacks on top for emphasis. */}
                <Area
                  type="monotone"
                  dataKey="normal"
                  name="Normal"
                  stackId="1"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#grad-normal)"
                  isAnimationActive
                  animationDuration={700}
                />
                <Area
                  type="monotone"
                  dataKey="attacks"
                  name="Attacks"
                  stackId="1"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="url(#grad-attacks)"
                  isAnimationActive
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  )
}
