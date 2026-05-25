import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ShieldAlert } from 'lucide-react'
import type { ByType } from '../types'
import { Card, EmptyState, SectionHeader, Skeleton } from './ui'

// Distinct violet/rose palette so slices read clearly on the dark theme.
const PALETTE = [
  '#a855f7',
  '#f43f5e',
  '#8b5cf6',
  '#fb7185',
  '#c084fc',
  '#fb923c',
  '#e879f9',
  '#f87171',
]

interface SliceTooltip {
  name: string
  value: number
  payload: { type: string; count: number }
}

export default function AttackTypes({
  data,
}: {
  data: ByType[] | null
}) {
  const total = data?.reduce((s, d) => s + d.count, 0) ?? 0

  return (
    <section id="attacks" className="h-full">
      <Card className="flex h-full flex-col p-5 sm:p-6">
        <SectionHeader
          eyebrow="Breakdown"
          title="Attack Types"
          subtitle="Distribution of detected injection techniques."
        />

        {!data ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-8 w-8" />}
            title="No attacks detected yet"
            hint="Detected techniques will appear here."
          />
        ) : (
          <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row">
            {/* Donut */}
            <div className="relative h-52 w-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="none"
                    animationDuration={700}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0] as unknown as SliceTooltip
                      const pct = total ? ((p.value / total) * 100).toFixed(1) : '0'
                      return (
                        <div className="rounded-lg border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-card backdrop-blur">
                          <div className="font-semibold text-white">
                            {p.payload.type}
                          </div>
                          <div className="text-slate-400">
                            {p.value} events · {pct}%
                          </div>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold tabular-nums text-white">
                  {total}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  attacks
                </span>
              </div>
            </div>

            {/* Legend / list */}
            <div className="flex w-full flex-col gap-2">
              {data.map((d, i) => {
                const pct = total ? (d.count / total) * 100 : 0
                return (
                  <div key={d.type} className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                    />
                    <span className="flex-1 truncate text-sm text-slate-300">
                      {d.type}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {pct.toFixed(0)}%
                    </span>
                    <span className="w-6 text-right text-sm font-semibold tabular-nums text-white">
                      {d.count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>
    </section>
  )
}
