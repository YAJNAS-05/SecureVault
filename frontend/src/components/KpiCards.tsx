import { Activity, Crosshair, Gauge, ScanLine } from 'lucide-react'
import type { ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import type { StatsResponse } from '../types'
import { thousands } from '../lib/format'
import { Card, Skeleton } from './ui'

interface KpiProps {
  stats: StatsResponse | null
  modelAccuracy: number | null
}

export default function KpiCards({ stats, modelAccuracy }: KpiProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-9 w-20" />
            <Skeleton className="mt-4 h-8 w-full" />
          </Card>
        ))}
      </div>
    )
  }

  const spark = stats.timeseries.map((t) => ({
    a: t.attacks,
    n: t.normal,
    total: t.attacks + t.normal,
  }))

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        icon={<ScanLine className="h-5 w-5" />}
        accent="brand"
        label="Requests Scanned"
        value={thousands(stats.totals.requests)}
        sub={`${stats.totals.normal} normal · ${stats.totals.attacks} flagged`}
        spark={spark}
        sparkKey="total"
        sparkColor="#a855f7"
      />
      <Kpi
        icon={<Crosshair className="h-5 w-5" />}
        accent="rose"
        label="Attacks Detected"
        value={thousands(stats.totals.attacks)}
        sub={`${stats.last_24h.attacks} in last 24h`}
        spark={spark}
        sparkKey="a"
        sparkColor="#f43f5e"
      />
      <Kpi
        icon={<Activity className="h-5 w-5" />}
        accent="amber"
        label="Attack Rate"
        value={`${stats.totals.attack_rate.toFixed(1)}%`}
        sub={`of all inspected traffic`}
        spark={spark}
        sparkKey="a"
        sparkColor="#f59e0b"
      />
      <Kpi
        icon={<Gauge className="h-5 w-5" />}
        accent="emerald"
        label="Model Accuracy"
        value={`${(modelAccuracy ?? stats.model.accuracy).toFixed(2)}%`}
        sub={`F1 ${stats.model.f1.toFixed(1)} · P ${stats.model.precision.toFixed(1)}`}
        spark={spark}
        sparkKey="n"
        sparkColor="#22c55e"
      />
    </div>
  )
}

const ACCENTS: Record<string, string> = {
  brand: 'text-brand-300 bg-brand-500/15 ring-brand-500/30',
  rose: 'text-rose-300 bg-rose-500/15 ring-rose-500/30',
  amber: 'text-amber-300 bg-amber-500/15 ring-amber-500/30',
  emerald: 'text-emerald-300 bg-emerald-500/15 ring-emerald-500/30',
}

function Kpi({
  icon,
  accent,
  label,
  value,
  sub,
  spark,
  sparkKey,
  sparkColor,
}: {
  icon: ReactNode
  accent: keyof typeof ACCENTS
  label: string
  value: string
  sub: string
  spark: Array<Record<string, number>>
  sparkKey: string
  sparkColor: string
}) {
  const gradId = `spark-${sparkKey}-${accent}`
  return (
    <Card hover className="relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {label}
          </div>
          <div className="mt-2 text-3xl font-extrabold tabular-nums text-white">
            {value}
          </div>
        </div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${ACCENTS[accent]}`}
        >
          {icon}
        </span>
      </div>

      <div className="mt-1 text-xs text-slate-500">{sub}</div>

      {/* Sparkline */}
      <div className="mt-3 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sparkColor} stopOpacity={0.45} />
                <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey={sparkKey}
              stroke={sparkColor}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
