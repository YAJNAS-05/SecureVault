/**
 * ActionBreakdown — BLOCK / ALLOW / REVIEW distribution chart.
 *
 * Shows a horizontal bar breakdown of the three possible actions the ensemble
 * has taken, plus latency percentile stats.
 */
import { Ban, CheckCircle, Clock, HelpCircle } from 'lucide-react'
import type { LatencyStats, StatsResponse } from '../types'
import { Card, SectionHeader, Skeleton } from './ui'

interface Props {
  stats: StatsResponse | null
}

const ACTION_CONFIG = {
  BLOCK: {
    label: 'BLOCKED',
    description: 'Ensemble decided to block the request',
    color: '#f43f5e',
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/30',
    text: 'text-rose-300',
    icon: Ban,
  },
  ALLOW: {
    label: 'ALLOWED',
    description: 'All detectors cleared the request',
    color: '#22c55e',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-300',
    icon: CheckCircle,
  },
  REVIEW: {
    label: 'REVIEW',
    description: 'Detectors disagreed — flagged for review',
    color: '#f59e0b',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    text: 'text-amber-300',
    icon: HelpCircle,
  },
} as const

export default function ActionBreakdown({ stats }: Props) {
  const ab = stats?.action_breakdown
  const latency = stats?.latency

  return (
    <section id="action-breakdown">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Ensemble decisions"
          title="Action Breakdown"
          subtitle="How the ensemble classified every request — BLOCK · ALLOW · REVIEW"
        />

        {!stats ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <ActionBars ab={ab} total={stats.totals.requests} />
            {latency && latency.samples > 0 && <LatencyPanel latency={latency} />}
          </>
        )}
      </Card>
    </section>
  )
}

function ActionBars({
  ab,
  total,
}: {
  ab: StatsResponse['action_breakdown'] | undefined
  total: number
}) {
  const safeAb = ab ?? { BLOCK: 0, ALLOW: 0, REVIEW: 0 }
  const actions = (['BLOCK', 'ALLOW', 'REVIEW'] as const).map((key) => ({
    key,
    count: safeAb[key],
    ...ACTION_CONFIG[key],
  }))

  return (
    <div className="space-y-3">
      {actions.map(({ key, count, label, description, color, bg, border, text, icon: Icon }) => {
        const pct = total > 0 ? (count / total) * 100 : 0
        return (
          <div
            key={key}
            className={`flex items-center gap-4 rounded-xl border ${border} ${bg} p-4`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${text}`}
              style={{ background: `${color}22` }}
            >
              <Icon className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-sm font-bold ${text}`}>{label}</span>
                <span className="text-[11px] text-slate-500">{description}</span>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-mono font-semibold text-slate-300">
                  {pct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className={`text-2xl font-extrabold tabular-nums ${text}`}>
                {count.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500">requests</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LatencyPanel({ latency }: { latency: LatencyStats }) {
  const tiles = [
    { label: 'Avg', value: latency.avg },
    { label: 'p50', value: latency.p50 },
    { label: 'p95', value: latency.p95 },
    { label: 'p99', value: latency.p99 },
  ]
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Clock className="h-3.5 w-3.5" />
        Detection Latency ({latency.samples.toLocaleString()} samples)
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center"
          >
            <div className="text-xl font-extrabold tabular-nums text-white">
              {value.toFixed(1)}
              <span className="text-xs font-medium text-slate-400"> ms</span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
